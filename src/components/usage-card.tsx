import Link from "next/link";
import type { getPlan } from "@/lib/plans";

type Plan = ReturnType<typeof getPlan>;

export function UsageCard({ plan, used, remaining }: { plan: Plan; used: number; remaining: number }) {
  const percentage = Math.min(100, Math.round((used / plan.limit) * 100));
  return (
    <article className="panel metric-card">
      <span>{plan.name} usage</span>
      <strong className="metric-value">{used.toLocaleString()} <small className="muted" style={{ font: "inherit", fontSize: "1rem" }}>/ {plan.limit.toLocaleString()}</small></strong>
      <div className="usage-track" aria-label={`${percentage}% of usage limit used`}><span style={{ width: `${percentage}%` }} /></div>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: ".78rem" }}>{remaining.toLocaleString()} checks remaining {plan.cadence === "month" ? "this month" : ""} {plan.id === "free" && <>· <Link href="/pricing" style={{ color: "var(--green)", fontWeight: 800 }}>Upgrade</Link></>}</p>
    </article>
  );
}