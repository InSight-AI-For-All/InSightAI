import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { BillingButton } from "@/components/billing-button";
import { LogoMark } from "@/components/brand";
import { PricingValue } from "@/components/pricing-value";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";
import { getServerEnvironment } from "@/lib/env";
import { getPlan, paidPlanIds, type PaidPlanId } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing" };

const descriptions: Record<PaidPlanId, { badge: string; audience: string }> = {
  starter: { badge: "Easy first upgrade", audience: "For checking a few posts every week." },
  pro: { badge: "Best value", audience: "For daily research, school, and content work." },
  max: { badge: "Highest volume", audience: "For power users checking throughout the day." },
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const user = await getCurrentUser();
  const overview = user ? await getDashboardOverview(user.id) : null;
  const parameters = await searchParams;
  const environment = getServerEnvironment();
  const configuredPrices: Record<PaidPlanId, boolean> = {
    starter: Boolean(environment.STRIPE_STARTER_399_PRICE_ID),
    pro: Boolean(environment.STRIPE_PRO_PRICE_ID),
    max: Boolean(environment.STRIPE_MAX_PRICE_ID),
  };

  return (
    <>
      <SiteHeader />
      <main className="pricing-page">
        <div className="container">
          <header className="pricing-heading">
            <LogoMark size={92} className="pricing-brand-mark" />
            <p className="eyebrow">Plans that respect the math</p>
            <h1>Choose how often you need a second look.</h1>
            <p>Every tier uses the same evidence standards. You pay only for more checks, not better answers.</p>
            <div className="pricing-trust">
              <span><Check size={14} /> No card for Free</span>
              <span><Check size={14} /> Cancel any time</span>
              <span><Check size={14} /> No rollover or surprise overages</span>
            </div>
          </header>
          {parameters.billing === "cancelled" && <p className="alert">Checkout was cancelled. Nothing changed on your account.</p>}
          {parameters.billing === "unavailable" && <p className="alert">That plan is not available in Stripe yet. Your current plan has not changed.</p>}
          <div className="pricing-page-grid">
            <article className="panel pricing-page-card">
              <div>
                <span className="status-pill">Try the complete product</span>
                <h2>Free</h2>
                <p className="pricing-page-price">$0</p>
                <p className="muted">Three checks total. No card required.</p>
                <ul>
                  <li><Check size={18} /> Text, links, and screenshots</li>
                  <li><Check size={18} /> Complete scoring and evidence</li>
                  <li><Check size={18} /> Private saved history</li>
                  <li><Check size={18} /> Same analysis quality as paid plans</li>
                </ul>
              </div>
              <Link className="button secondary" href={user ? "/check" : "/login"}>
                {user ? "Use a free check" : "Start with 3 free"}
              </Link>
            </article>
            {paidPlanIds.map((planId) => {
              const plan = getPlan(planId);
              const currentPaid = overview?.plan.id !== "free";
              const description = descriptions[planId];
              return (
                <article className={`panel pricing-page-card ${planId === "pro" ? "pricing-page-featured" : ""}`} key={planId}>
                  <div>
                    <span className="status-pill">{planId === "pro" && <Sparkles size={14} />} {description.badge}</span>
                    <h2>{plan.name}</h2>
                    <p className="pricing-page-price">${plan.price.toFixed(2)} <small>/ month</small></p>
                    <p className="muted">{description.audience}</p>
                    <ul>
                      <li><Check size={18} /> {plan.limit} checks each month</li>
                      <li><Check size={18} /> About {Math.ceil(plan.price * 100 / plan.limit)} cents per included check</li>
                      <li><Check size={18} /> Complete evidence-assisted analysis</li>
                      <li><Check size={18} /> Results saved privately</li>
                      <li><Check size={18} /> Cancel or change plans any time</li>
                    </ul>
                  </div>
                  {user ? currentPaid ? (
                    <BillingButton mode="portal" secondary={planId !== "pro"}>Manage plan</BillingButton>
                  ) : (
                    <BillingButton plan={planId} secondary={planId !== "pro"} disabled={!configuredPrices[planId]}>
                      {configuredPrices[planId] ? `Choose ${plan.name}` : "Stripe price pending"}
                    </BillingButton>
                  ) : (
                    <Link className={`button ${planId !== "pro" ? "secondary" : ""}`} href="/login">
                      Sign in to choose {plan.name}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
          <PricingValue />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
