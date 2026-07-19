import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerEnvironment } from "@/lib/env";
import { getPaidPlanForStripePrice } from "@/lib/plans";
import { getRequestId, isRequestBodyTooLarge } from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createStripeClient } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordApiRequest, recordBillingEvent, recordError, recordTelemetryEvent } from "@/lib/telemetry/server";

export const runtime = "nodejs";

function timestampToIso(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1_000).toISOString() : null;
}

async function syncSubscription(subscription: Stripe.Subscription, eventId: string, eventCreated: number) {
  const admin = createAdminSupabaseClient();
  const userId = z.string().uuid().parse(subscription.metadata.user_id);

  const active = ["active", "trialing"].includes(subscription.status);
  const period = subscription.items.data[0]?.current_period_end;
  const periodStart = subscription.items.data[0]?.current_period_start;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;
  const environment = getServerEnvironment();
  const paidPlan = priceId ? getPaidPlanForStripePrice(priceId, {
    starter: environment.STRIPE_STARTER_399_PRICE_ID,
    legacyStarter: environment.STRIPE_STARTER_PRICE_ID,
    pro: environment.STRIPE_PRO_PRICE_ID,
    max: environment.STRIPE_MAX_PRICE_ID,
  }) : null;
  if (active && !paidPlan) throw new Error("The subscription price is not configured for a plan.");

  const { error } = await admin.rpc("sync_stripe_subscription", {
    p_event_id: eventId,
    p_user_id: userId,
    p_customer_id: customerId,
    p_subscription_id: subscription.id,
    p_plan: active ? paidPlan : "free",
    p_status: subscription.status,
    p_period_start: timestampToIso(periodStart),
    p_period_end: timestampToIso(period),
    p_event_created: eventCreated,
  });
  if (error) throw error;
  return { userId, plan: active ? paidPlan : "free", status: subscription.status };
}

async function findBillingUser(input: { subscriptionId?: string | null; customerId?: string | null }) {
  const admin = createAdminSupabaseClient();
  let query = admin.from("subscriptions").select("user_id, plan, status");
  if (input.subscriptionId) query = query.eq("stripe_subscription_id", input.subscriptionId);
  else if (input.customerId) query = query.eq("stripe_customer_id", input.customerId);
  else return null;
  const { data } = await query.maybeSingle();
  return data as { user_id: string; plan: string; status: string } | null;
}

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  if (isRequestBodyTooLarge(request, 1024 * 1024)) {
    return NextResponse.json({ error: "Webhook payload is too large.", code: "PAYLOAD_TOO_LARGE", requestId }, {
      status: 413,
      headers: { "X-Request-ID": requestId },
    });
  }
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = getServerEnvironment().STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return NextResponse.json({ error: "Webhook is not configured.", code: "NOT_CONFIGURED", requestId }, { status: 400, headers: { "X-Request-ID": requestId } });

  let event: Stripe.Event;
  try {
    event = createStripeClient().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature.", code: "INVALID_SIGNATURE", requestId }, { status: 400, headers: { "X-Request-ID": requestId } });
  }

  try {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const synced = await syncSubscription(event.data.object as Stripe.Subscription, event.id, event.created);
      const eventName = event.type === "customer.subscription.created"
        ? "subscription_created"
        : event.type === "customer.subscription.deleted"
          ? "subscription_canceled"
          : "subscription_updated";
      await recordBillingEvent({ eventName, providerEventId: event.id, userId: synced.userId, requestId, plan: synced.plan, subscriptionStatus: synced.status });
      await recordTelemetryEvent({ eventName, category: "billing", userId: synced.userId, requestId, metadata: { plan: synced.plan, status: synced.status } });
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = z.string().uuid().safeParse(session.metadata?.user_id);
      await recordBillingEvent({ eventName: "checkout_completed", providerEventId: event.id, userId: userId.success ? userId.data : null, requestId, plan: session.metadata?.plan, amountCents: session.amount_total, currency: session.currency, metadata: { paymentStatus: session.payment_status } });
      await recordTelemetryEvent({ eventName: "checkout_completed", category: "billing", userId: userId.success ? userId.data : null, requestId, metadata: { plan: session.metadata?.plan || "unknown" } });
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: unknown;
        parent?: { subscription_details?: { subscription?: unknown } };
      };
      const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription || invoice.subscription);
      const customerId = stripeId(invoice.customer);
      const billingUser = await findBillingUser({ subscriptionId, customerId });
      const paid = event.type === "invoice.paid";
      await recordBillingEvent({
        eventName: paid ? "invoice_paid" : "invoice_failed",
        providerEventId: event.id,
        userId: billingUser?.user_id,
        requestId,
        plan: billingUser?.plan,
        subscriptionStatus: billingUser?.status,
        amountCents: paid ? invoice.amount_paid : invoice.amount_due,
        currency: invoice.currency,
        success: paid,
        errorCode: paid ? null : "PAYMENT_FAILED",
      });
    }
    await recordApiRequest({ endpoint: "/api/stripe/webhook", method: "POST", statusCode: 200, latencyMs: Date.now() - startedAt, requestId, metadata: { eventType: event.type } });
    return NextResponse.json({ received: true }, { headers: { "X-Request-ID": requestId } });
  } catch (error) {
    logServerError("stripe.webhook_failed", { requestId, eventType: event.type, errorName: getErrorName(error) });
    await recordBillingEvent({ eventName: event.type, providerEventId: event.id, requestId, success: false, errorCode: getErrorName(error) });
    await recordError({ error, type: "payment_error", severity: "critical", endpoint: "/api/stripe/webhook", requestId, metadata: { eventType: event.type } });
    await recordApiRequest({ endpoint: "/api/stripe/webhook", method: "POST", statusCode: 500, latencyMs: Date.now() - startedAt, requestId, errorType: "payment_error", errorCode: "WEBHOOK_FAILED", metadata: { eventType: event.type } });
    return NextResponse.json({ error: "Webhook processing failed.", code: "WEBHOOK_FAILED", requestId }, { status: 500, headers: { "X-Request-ID": requestId } });
  }
}