import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CheckRow } from "@/components/check-row";
import { requireUser } from "@/lib/auth";
import { getFactChecks } from "@/lib/data";
import { categories, verdicts } from "@/lib/fact-check/schema";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; verdict?: string; category?: string; from?: string }> }) {
  const user = await requireUser();
  const filters = await searchParams;
  const checks = await getFactChecks(user.id, { query: filters.q, verdict: filters.verdict, category: filters.category, from: filters.from });

  return <><header className="page-heading"><div><p className="eyebrow">Your research trail</p><h1>Check history</h1><p>Revisit an analysis or narrow the list by what matters.</p></div></header><form className="filters"><input className="input" name="q" defaultValue={filters.q} placeholder="Search summaries or claims" aria-label="Search history" /><select className="select" name="verdict" defaultValue={filters.verdict || ""} aria-label="Filter by verdict"><option value="">All verdicts</option>{verdicts.map((verdict) => <option key={verdict}>{verdict}</option>)}</select><select className="select" name="category" defaultValue={filters.category || ""} aria-label="Filter by category"><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><input className="input" type="date" name="from" defaultValue={filters.from} aria-label="Checks after date" /><button className="button" type="submit"><Search size={17} /> Filter</button></form><section className="panel check-list">{checks.length ? checks.map((check) => <CheckRow check={check} key={check.id} />) : <div className="empty-state"><Search size={30} style={{ color: "var(--green)", marginBottom: 14 }} /><h2>No checks found.</h2><p className="muted">Try clearing a filter or start a new analysis.</p><Link className="button" href="/check">New check</Link></div>}</section></>;
}