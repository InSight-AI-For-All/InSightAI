import Link from "next/link";
import { ArrowUpRight, FileText, Image as ImageIcon, Link2 } from "lucide-react";
import type { FactCheckRecord } from "@/lib/data";

export function CheckRow({ check }: { check: FactCheckRecord }) {
  const Icon = check.inputType === "link" ? Link2 : check.inputType === "screenshot" ? ImageIcon : FileText;
  return (
    <Link className="check-row" href={`/results/${check.id}`}>
      <span className="check-type-icon"><Icon size={18} /></span>
      <span className="check-summary"><strong title={check.summary}>{check.summary}</strong><small>{new Date(check.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {check.category}</small></span>
      <span className="status-pill">{check.verdict}</span>
      <span><span className="score-compact">{check.truthScore ?? "—"}</span>{check.truthScore !== null && <small className="muted"> / 100</small>}</span>
      <ArrowUpRight size={18} className="muted" />
    </Link>
  );
}