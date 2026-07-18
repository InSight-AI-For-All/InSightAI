import type { Metadata } from "next";
import { CreditCard, LogOut, ShieldCheck } from "lucide-react";
import { AccountForm } from "@/components/account-form";
import { BillingButton } from "@/components/billing-button";
import { requireUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const user = await requireUser();
  const overview = await getDashboardOverview(user.id);
  const parameters = await searchParams;

  return <><header className="page-heading"><div><p className="eyebrow">Settings</p><h1>Your account</h1><p>Profile, plan, and account controls in one place.</p></div></header>{parameters.billing === "unavailable" && <p className="alert">The billing portal is temporarily unavailable or not configured.</p>}<div className="settings-grid"><section className="panel settings-panel"><h2>Profile</h2><p className="muted">Used to personalize your InSight workspace.</p><AccountForm fullName={overview?.fullName || user.user_metadata.full_name || ""} email={user.email || ""} /></section><section className="panel settings-panel"><h2><CreditCard size={21} /> Billing</h2><p className="muted">You are on the <strong>{overview?.plan.name || "Free"}</strong> plan.</p>{overview?.plan.id === "starter" ? <BillingButton mode="portal">Manage subscription</BillingButton> : <BillingButton>Upgrade to Starter</BillingButton>}</section><section className="panel settings-panel"><h2><ShieldCheck size={21} /> Privacy &amp; safety</h2><p className="muted">Your history and screenshots are private to your account through Supabase Row Level Security.</p></section><section className="panel settings-panel"><h2><LogOut size={21} /> Sign out</h2><p className="muted">End your session on this device.</p><form action="/auth/signout" method="post"><button className="button secondary" type="submit">Sign out</button></form></section></div></>;
}