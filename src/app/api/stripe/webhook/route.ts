import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerEnvironment } from "@/lib/env";
import { getRequestId, isRequestBodyTooLarge } from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createStripeClient } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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

  const { error } = await admin.rpc("sync_stripe_subscription", {
    p_event_id: eventId,
    p_user_id: userId,
    p_customer_id: customerId,
    p_subscription_id: subscription.id,
    p_plan: active ? "starter" : "free",
    p_status: subscription.status,
    p_period_start: timestampToIso(periodStart),
    p_period_end: timestampToIso(period),
    p_event_created: eventCreated,
  });
  if (error) throw error;
}

export async function POST(request: NextRequest) {
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
      await syncSubscription(event.data.object as Stripe.Subscription, event.id, event.created);
    }
    return NextResponse.json({ received: true }, { headers: { "X-Request-ID": requestId } });
  } catch (error) {
    logServerError("stripe.webhook_failed", { requestId, eventType: event.type, errorName: getErrorName(error) });
    return NextResponse.json({ error: "Webhook processing failed.", code: "WEBHOOK_FAILED", requestId }, { status: 500, headers: { "X-Request-ID": requestId } });
  }
}