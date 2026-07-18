import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame, History, Plus, ScanSearch, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
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
      <header className="page-heading"><div><p className="eyebrow">Your signal today</p><h1>Hey {firstName}, what are we checking?</h1><p>Your private pulse on the posts, claims, and screenshots crossing your feed.</p></div><Link className="button" href="/check"><Plus size={18} /> New check</Link></header>
      {overview ? <>
        <section className="dashboard-signal">
          <div className="signal-score"><span><ScanSearch size={20} /></span><div><small>Average truth score</small><strong>{overview.averageTruth ?? "—"}</strong><em>{overview.averageTruth === null ? "Your signal starts with the first check" : "across your recent history"}</em></div></div>
          <div className="signal-insights"><span><ShieldAlert size={18} /><strong>{overview.needsReview}</strong><small>needed caution</small></span><span><Flame size={18} /><strong>{overview.topCategory || "—"}</strong><small>top category</small></span><span><TrendingUp size={18} /><strong>{overview.totalChecks}</strong><small>total checks</small></span></div>
        </section>
        <section className="metric-grid">
          <UsageCard plan={overview.plan} used={overview.used} remaining={overview.remaining} />
          <article className="panel metric-card"><span>Current plan</span><strong className="metric-value">{overview.plan.name}</strong><Link href="/pricing" style={{ color: "var(--green)", fontWeight: 800, fontSize: ".82rem" }}>{overview.plan.id === "free" ? "Upgrade plan" : "Manage billing"} <ArrowRight size={14} style={{ display: "inline" }} /></Link></article>
          <article className="panel metric-card"><span>Checks completed</span><strong className="metric-value">{overview.used.toLocaleString()}</strong><small className="muted">{overview.plan.cadence === "month" ? "This month" : "All time"}</small></article>
        </section>
        <div className="section-row"><h2>Recent checks</h2><Link href="/history" className="muted" style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 700 }}><History size={16} /> View history</Link></div>
        <section className="panel check-list">{overview.recentChecks.length ? overview.recentChecks.map((check) => <CheckRow check={check} key={check.id} />) : <div className="empty-state"><Sparkles size={30} style={{ color: "var(--lime)", marginBottom: 14 }} /><h2>Your feed has questions.</h2><p className="muted">Paste the next post that makes you pause. Your trends will build from there.</p><Link className="button" href="/check">Check your first post</Link></div>}</section>
      </> : <div className="alert">Your workspace is not ready yet. Check the app configuration and try again.</div>}
    </>
  );
}