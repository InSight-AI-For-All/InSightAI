import type { Metadata } from "next";
import { CreditCard, LogOut, ShieldCheck } from "lucide-react";
import { AccountForm } from "@/components/account-form";
import { BillingButton } from "@/components/billing-button";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const user = await requireUser();
  const overview = await getDashboardOverview(user.id);
  const supabase = await createServerSupabaseClient();
  const { data: profile } = supabase ? await supabase.from("profiles").select("email, phone, auth_provider, auth_providers").eq("id", user.id).maybeSingle() : { data: null };
  const parameters = await searchParams;

  const providers = profile?.auth_providers?.length ? profile.auth_providers : [profile?.auth_provider || user.app_metadata.provider || "email"];
  return <><header className="page-heading"><div><p className="eyebrow">Your space</p><h1>Settings that stay out of the way.</h1><p>Profile, plan, privacy, and session controls.</p></div></header>{parameters.billing === "unavailable" && <p className="alert">Billing could not open right now. Your current plan has not changed.</p>}<div className="settings-grid"><section className="panel settings-panel"><span className="settings-label">IDENTITY</span><h2>Profile</h2><p className="muted">How InSight greets you across your workspace.</p><AccountForm fullName={overview?.fullName || user.user_metadata.full_name || ""} email={profile?.email || user.email || undefined} phone={profile?.phone || user.phone || undefined} providers={providers} /></section><section className="panel settings-panel settings-highlight"><span className="settings-label">CURRENT PLAN</span><h2><CreditCard size={21} /> {overview?.plan.name || "Free"}</h2><p className="muted">{overview?.plan.id === "free" ? "Three complete checks, with no card required." : `${overview?.plan.limit || 0} checks refresh every month.`}</p>{overview?.plan.id !== "free" ? <BillingButton mode="portal">Manage subscription</BillingButton> : <a className="button" href="/pricing">Compare paid plans</a>}</section><section className="panel settings-panel"><span className="settings-label">PRIVATE BY DEFAULT</span><h2><ShieldCheck size={21} /> Your data</h2><p className="muted">Your history is protected by user-scoped database policies. Screenshots are analyzed without being persisted, and share cards are created on your device.</p></section><section className="panel settings-panel"><span className="settings-label">THIS DEVICE</span><h2><LogOut size={21} /> Session</h2><p className="muted">Sign out of InSight on this device and clear local auth state.</p><SignOutButton /></section></div></>;
}