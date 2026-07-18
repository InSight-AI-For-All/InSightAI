import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, GraduationCap, School, Sparkles, Users } from "lucide-react";
import { BillingButton } from "@/components/billing-button";
import { PricingValue } from "@/components/pricing-value";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const user = await getCurrentUser();
  const overview = user ? await getDashboardOverview(user.id) : null;
  const parameters = await searchParams;

  return <><SiteHeader /><main className="pricing-page"><div className="container"><header className="pricing-heading"><p className="eyebrow">Simple on purpose</p><h1>A second opinion for less than one coffee.</h1><p>Start with the complete product. Upgrade only when fact-checking becomes part of your everyday scroll.</p><div className="pricing-trust"><span><Check size={14} /> No card for Free</span><span><Check size={14} /> Cancel any time</span><span><Check size={14} /> Private history</span></div></header>{parameters.billing === "cancelled" && <p className="alert">Checkout was cancelled. Nothing changed on your account.</p>}{parameters.billing === "unavailable" && <p className="alert">Billing could not open right now. Your current plan has not changed.</p>}<div className="pricing-page-grid"><article className="panel pricing-page-card"><div><span className="status-pill">Try the full experience</span><h2>Free</h2><p className="pricing-page-price">$0</p><p className="muted">Five checks total. Enough to feel the difference.</p><ul><li><Check size={18} /> Text, links, and screenshots</li><li><Check size={18} /> Truth and confidence scores</li><li><Check size={18} /> Full evidence-assisted analysis</li><li><Check size={18} /> Private saved history</li></ul></div><Link className="button secondary" href={user ? "/check" : "/login"}>{user ? "Use a free check" : "Start with 5 free"}</Link></article><article className="panel pricing-page-card pricing-page-featured"><div><span className="status-pill"><Sparkles size={14} /> Best for daily scrolling</span><h2>Starter</h2><p className="pricing-page-price">$4.99 <small>/ month</small></p><p className="muted">1,000 checks monthly. That is less than 1¢ each.</p><ul><li><Check size={18} /> Everything in Free</li><li><Check size={18} /> 1,000 checks every month</li><li><Check size={18} /> Every result saved privately</li><li><Check size={18} /> Secure Stripe billing</li><li><Check size={18} /> Cancel in two taps</li></ul></div>{user ? overview?.plan.id === "starter" ? <BillingButton mode="portal">Manage billing</BillingButton> : <BillingButton>Unlock Starter <ArrowRight size={17} /></BillingButton> : <Link className="button" href="/login?next=/pricing">Sign in to upgrade <ArrowRight size={17} /></Link>}</article></div><PricingValue /><section className="future-plans"><div><p className="eyebrow">More ways to InSight</p><h2>Plans for the people who shape what others believe.</h2></div><div className="future-plan-list"><span><GraduationCap size={18} /> Student</span><span><Sparkles size={18} /> Creator</span><span><School size={18} /> Educator</span><span><Users size={18} /> Teams &amp; schools</span></div></section></div></main><SiteFooter /></>;
}