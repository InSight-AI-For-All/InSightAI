import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerEnvironment } from "@/lib/env";
import { createStripeClient } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function timestampToIso(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1_000).toISOString() : null;
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number) {
  const admin = createAdminSupabaseClient();
  const userId = z.string().uuid().parse(subscription.metadata.user_id);

  const active = ["active", "trialing"].includes(subscription.status);
  const period = subscription.items.data[0]?.current_period_end;
  const periodStart = subscription.items.data[0]?.current_period_start;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { error } = await admin.rpc("sync_stripe_subscription", {
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
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = getServerEnvironment().STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = createStripeClient().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription, event.created);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", { eventId: event.id, error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}