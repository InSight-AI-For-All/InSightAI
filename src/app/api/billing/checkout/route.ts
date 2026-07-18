import { NextResponse, type NextRequest } from "next/server";
import { ConfigurationError, getAppUrl, getServerEnvironment } from "@/lib/env";
import { getRequestId, isSameOriginRequest } from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createStripeClient } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
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
    if (!environment.STRIPE_STARTER_PRICE_ID) throw new ConfigurationError("Stripe Starter price");
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
      line_items: [{ price: environment.STRIPE_STARTER_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${getAppUrl()}/dashboard?billing=success`,
      cancel_url: `${getAppUrl()}/pricing?billing=cancelled`,
      subscription_data: { metadata: { user_id: user.id, plan: "starter" } },
      metadata: { user_id: user.id, plan: "starter" },
    }, {
      idempotencyKey: `checkout:${user.id}:${Math.floor(Date.now() / 300_000)}`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    logServerError("stripe.checkout_failed", { requestId, errorName: getErrorName(error) });
    return NextResponse.redirect(new URL("/pricing?billing=unavailable", request.url), { status: 303 });
  }
}