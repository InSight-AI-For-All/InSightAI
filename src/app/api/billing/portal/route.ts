import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { getRequestId, isSameOriginRequest } from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createStripeClient } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordApiRequest, recordBillingEvent, recordError } from "@/lib/telemetry/server";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "This request origin is not allowed.", code: "INVALID_ORIGIN", requestId }, { status: 403, headers: { "X-Request-ID": requestId } });
  }
  const supabase = await createServerSupabaseClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = authData.user;
  if (!user) return NextResponse.redirect(new URL("/login?next=/account", request.url), { status: 303 });
  if (!supabase) return NextResponse.redirect(new URL("/account?billing=unavailable", request.url), { status: 303 });

  const { data: subscription, error: subscriptionError } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (subscriptionError) return NextResponse.redirect(new URL("/account?billing=unavailable", request.url), { status: 303 });
  if (!subscription?.stripe_customer_id) return NextResponse.redirect(new URL("/pricing", request.url), { status: 303 });

  try {
    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({ customer: subscription.stripe_customer_id, return_url: `${getAppUrl()}/account` });
    await recordBillingEvent({ eventName: "billing_portal_opened", providerEventId: session.id, userId: user.id, requestId });
    await recordApiRequest({ endpoint: "/api/billing/portal", method: "POST", statusCode: 303, latencyMs: Date.now() - startedAt, userId: user.id, requestId });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    logServerError("stripe.portal_failed", { requestId, errorName: getErrorName(error) });
    await recordError({ error, type: "payment_error", severity: "error", endpoint: "/api/billing/portal", userId: user.id, requestId });
    await recordApiRequest({ endpoint: "/api/billing/portal", method: "POST", statusCode: 503, latencyMs: Date.now() - startedAt, userId: user.id, requestId, errorType: "payment_error", errorCode: "PORTAL_FAILED" });
    return NextResponse.redirect(new URL("/account?billing=unavailable", request.url), { status: 303 });
  }
}