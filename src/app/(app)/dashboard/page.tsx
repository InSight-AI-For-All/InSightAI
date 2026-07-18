import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, History, Plus, Sparkles } from "lucide-react";
import { CheckRow } from "@/components/check-row";
import { UsageCard } from "@/components/usage-card";
import { requireUser } from "@/lib/auth";
import { getDashboardOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const overview = await getDashboardOverview(user.id);
  const firstName = overview?.fullName?.split(" ")[0] || user.user_metadata.full_name?.split(" ")[0] || "there";

  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Your truth-check desk</p><h1>Good to see you, {firstName}.</h1><p>Know what deserves a closer look before it leaves your hands.</p></div><Link className="button" href="/check"><Plus size={18} /> New check</Link></header>
      {overview ? <>
        <section className="metric-grid">
          <UsageCard plan={overview.plan} used={overview.used} remaining={overview.remaining} />
          <article className="panel metric-card"><span>Current plan</span><strong className="metric-value">{overview.plan.name}</strong><Link href="/pricing" style={{ color: "var(--green)", fontWeight: 800, fontSize: ".82rem" }}>{overview.plan.id === "free" ? "Upgrade plan" : "Manage billing"} <ArrowRight size={14} style={{ display: "inline" }} /></Link></article>
          <article className="panel metric-card"><span>Checks completed</span><strong className="metric-value">{overview.used.toLocaleString()}</strong><small className="muted">{overview.plan.cadence === "month" ? "This billing month" : "All time"}</small></article>
        </section>
        <div className="section-row"><h2>Recent checks</h2><Link href="/history" className="muted" style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 700 }}><History size={16} /> View history</Link></div>
        <section className="panel check-list">{overview.recentChecks.length ? overview.recentChecks.map((check) => <CheckRow check={check} key={check.id} />) : <div className="empty-state"><Sparkles size={30} style={{ color: "var(--green)", marginBottom: 14 }} /><h2>Your first check starts here.</h2><p className="muted">Paste the post you are wondering about and get a structured first pass.</p><Link className="button" href="/check">InSight a post</Link></div>}</section>
      </> : <div className="alert">The dashboard needs Supabase configuration. Add the environment variables and run the database migration.</div>}
    </>
  );
}