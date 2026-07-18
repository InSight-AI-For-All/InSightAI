import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";
import { CheckRow } from "@/components/check-row";
import { requireUser } from "@/lib/auth";
import { getFactChecks } from "@/lib/data";
import { categories, verdicts } from "@/lib/fact-check/schema";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; verdict?: string; category?: string; from?: string }> }) {
  const user = await requireUser();
  const filters = await searchParams;
  const checks = await getFactChecks(user.id, { query: filters.q, verdict: filters.verdict, category: filters.category, from: filters.from });

  const hasFilters = Boolean(filters.q || filters.verdict || filters.category || filters.from);

  return <><header className="page-heading"><div><p className="eyebrow">Your private signal archive</p><h1>Every check. Easy to find.</h1><p>Jump back into a result or spot patterns in what crosses your feed.</p></div></header><div className="filter-heading"><span>{checks.length} {checks.length === 1 ? "result" : "results"}</span>{hasFilters && <Link href="/history"><RotateCcw size={14} /> Clear filters</Link>}</div><form className="filters"><input className="input" name="q" defaultValue={filters.q} placeholder="Search your checks" aria-label="Search history" /><select className="select" name="verdict" defaultValue={filters.verdict || ""} aria-label="Filter by verdict"><option value="">Any verdict</option>{verdicts.map((verdict) => <option key={verdict}>{verdict}</option>)}</select><select className="select" name="category" defaultValue={filters.category || ""} aria-label="Filter by category"><option value="">Any category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><input className="input" type="date" name="from" defaultValue={filters.from} aria-label="Checks after date" /><button className="button" type="submit"><Search size={17} /> Search</button></form><section className="panel check-list">{checks.length ? checks.map((check) => <CheckRow check={check} key={check.id} />) : <div className="empty-state"><Search size={30} style={{ color: "var(--lime)", marginBottom: 14 }} /><h2>{hasFilters ? "No matches in your signal." : "Nothing checked yet."}</h2><p className="muted">{hasFilters ? "Clear a filter or try a different phrase." : "Your first result will land here, ready whenever you need it."}</p><Link className="button" href={hasFilters ? "/history" : "/check"}>{hasFilters ? "Clear filters" : "Start a check"}</Link></div>}</section></>;
}