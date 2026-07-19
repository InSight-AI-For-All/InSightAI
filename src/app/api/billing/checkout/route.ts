import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ConfigurationError, getAppUrl, getServerEnvironment } from "@/lib/env";
import { getStripePriceForPaidPlan, paidPlanIds, type PaidPlanId } from "@/lib/plans";
import { getRequestId, isSameOriginRequest } from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createStripeClient } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordApiRequest, recordBillingEvent, recordError, recordTelemetryEvent } from "@/lib/telemetry/server";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "This request origin is not allowed.", code: "INVALID_ORIGIN", requestId }, { status: 403, headers: { "X-Request-ID": requestId } });
  }
  const supabase = await createServerSupabaseClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = authData.user;
  if (!user) return NextResponse.redirect(new URL("/login?next=/pricing", request.url), { status: 303 });
  if (!supabase) return NextResponse.redirect(new URL("/pricing?billing=unavailable", request.url), { status: 303 });

  try {
    const environment = getServerEnvironment();
    const formData = await request.formData();
    const plan = z.enum(paidPlanIds).parse(formData.get("plan") || "starter");
    await recordTelemetryEvent({ eventName: "checkout_started", category: "billing", userId: user.id, requestId, metadata: { plan } });
    await recordBillingEvent({ eventName: "checkout_started", userId: user.id, requestId, plan });
    const priceIds: Record<PaidPlanId, string> = {
      starter: environment.STRIPE_STARTER_399_PRICE_ID,
      pro: environment.STRIPE_PRO_PRICE_ID,
      max: environment.STRIPE_MAX_PRICE_ID,
    };
    const priceId = getStripePriceForPaidPlan(plan, priceIds);
    if (!priceId) throw new ConfigurationError(`Stripe ${plan} price`);
    const stripe = createStripeClient();
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subscriptionError) throw new Error("Subscription status could not be loaded.");

    if (subscription?.stripe_customer_id && ["active", "trialing"].includes(subscription.status)) {
      const portal = await stripe.billingPortal.sessions.create({ customer: subscription.stripe_customer_id, return_url: `${getAppUrl()}/account` });
      return NextResponse.redirect(portal.url, { status: 303 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: subscription?.stripe_customer_id || undefined,
      customer_email: subscription?.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${getAppUrl()}/dashboard?billing=success`,
      cancel_url: `${getAppUrl()}/pricing?billing=cancelled`,
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id, plan },
    }, {
      idempotencyKey: `checkout:${user.id}:${plan}:${Math.floor(Date.now() / 300_000)}`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await recordBillingEvent({ eventName: "checkout_session_created", providerEventId: session.id, userId: user.id, requestId, plan, metadata: { mode: session.mode || "subscription" } });
    await recordApiRequest({ endpoint: "/api/billing/checkout", method: "POST", statusCode: 303, latencyMs: Date.now() - startedAt, userId: user.id, requestId, metadata: { plan } });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    logServerError("stripe.checkout_failed", { requestId, errorName: getErrorName(error) });
    await recordBillingEvent({ eventName: "checkout_failed", userId: user.id, requestId, success: false, errorCode: getErrorName(error) });
    await recordError({ error, type: "payment_error", severity: "error", endpoint: "/api/billing/checkout", userId: user.id, requestId });
    await recordApiRequest({ endpoint: "/api/billing/checkout", method: "POST", statusCode: 503, latencyMs: Date.now() - startedAt, userId: user.id, requestId, errorType: "payment_error", errorCode: "CHECKOUT_FAILED" });
    return NextResponse.redirect(new URL("/pricing?billing=unavailable", request.url), { status: 303 });
  }
}