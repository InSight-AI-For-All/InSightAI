import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, GraduationCap, School, Sparkles, Users } from "lucide-react";
import { BillingButton } from "@/components/billing-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const user = await getCurrentUser();
  const overview = user ? await getDashboardOverview(user.id) : null;
  const parameters = await searchParams;
  return <><SiteHeader /><main className="pricing-page"><div className="container"><header className="pricing-heading"><p className="eyebrow">Clear pricing. No gotchas.</p><h1>Fact-check more than your group chat.</h1><p>Start with five complete checks. Move to Starter when verifying becomes part of how you use the internet.</p></header>{parameters.billing === "cancelled" && <p className="alert">Checkout was cancelled. Your current plan has not changed.</p>}{parameters.billing === "unavailable" && <p className="alert">Billing is not configured or temporarily unavailable.</p>}<div className="pricing-page-grid"><article className="panel pricing-page-card"><div><span className="status-pill">Try it first</span><h2>Free</h2><p className="pricing-page-price">$0</p><p className="muted">Five complete checks, forever.</p><ul><li><Check size={18} /> Text, links, and screenshots</li><li><Check size={18} /> Truth and confidence scores</li><li><Check size={18} /> Saved private history</li></ul></div><Link className="button secondary" href={user ? "/check" : "/login"}>{user ? "Start a check" : "Create free account"}</Link></article><article className="panel pricing-page-card pricing-page-featured"><div><span className="status-pill">Everyday plan</span><h2>Starter</h2><p className="pricing-page-price">$4.99 <small>/ month</small></p><p className="muted">1,000 checks every billing month.</p><ul><li><Check size={18} /> Everything in Free</li><li><Check size={18} /> 1,000 monthly checks</li><li><Check size={18} /> Secure Stripe billing</li><li><Check size={18} /> Cancel from your billing portal</li></ul></div>{user ? overview?.plan.id === "starter" ? <BillingButton mode="portal">Manage billing</BillingButton> : <BillingButton>Choose Starter <ArrowRight size={17} /></BillingButton> : <Link className="button" href="/login?next=/pricing">Sign in to upgrade <ArrowRight size={17} /></Link>}</article></div><section className="future-plans"><div><p className="eyebrow">Designed to grow</p><h2>Plans for classrooms, creators, and teams are next.</h2></div><div className="future-plan-list"><span><GraduationCap size={19} /> Student</span><span><Sparkles size={19} /> Creator</span><span><School size={19} /> Educator</span><span><Users size={19} /> Teams &amp; schools</span></div></section></div></main><SiteFooter /></>;
}