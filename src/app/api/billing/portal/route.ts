import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createStripeClient } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = authData.user;
  if (!user) return NextResponse.redirect(new URL("/login?next=/account", request.url), { status: 303 });
  if (!supabase) return NextResponse.redirect(new URL("/account?billing=unavailable", request.url), { status: 303 });

  const { data: subscription } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!subscription?.stripe_customer_id) return NextResponse.redirect(new URL("/pricing", request.url), { status: 303 });

  try {
    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({ customer: subscription.stripe_customer_id, return_url: `${getAppUrl()}/account` });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    console.error("Billing portal failed", { userId: user.id, error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.redirect(new URL("/account?billing=unavailable", request.url), { status: 303 });
  }
}