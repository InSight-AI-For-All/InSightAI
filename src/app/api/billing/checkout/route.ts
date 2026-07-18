import { NextResponse, type NextRequest } from "next/server";
import { ConfigurationError, getAppUrl, getServerEnvironment } from "@/lib/env";
import { createStripeClient } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = authData.user;
  if (!user) return NextResponse.redirect(new URL("/login?next=/pricing", request.url), { status: 303 });
  if (!supabase) return NextResponse.redirect(new URL("/pricing?billing=unavailable", request.url), { status: 303 });

  try {
    const environment = getServerEnvironment();
    if (!environment.STRIPE_STARTER_PRICE_ID) throw new ConfigurationError("Stripe Starter price");
    const stripe = createStripeClient();
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

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
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    console.error("Checkout creation failed", { userId: user.id, error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.redirect(new URL("/pricing?billing=unavailable", request.url), { status: 303 });
  }
}