import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { ResultView } from "@/components/result-view";
import { requireUser } from "@/lib/auth";
import { getFactCheck } from "@/lib/data";

export const metadata: Metadata = { title: "Fact-check result" };

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const check = await getFactCheck(user.id, id);
  if (!check) notFound();

  return <><header className="page-heading"><div><Link href="/history" className="muted" style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><ArrowLeft size={16} /> History</Link><h1>Your InSight</h1><p>Evidence-assisted analysis with the uncertainty left visible.</p></div><Link className="button" href="/check"><Plus size={17} /> New check</Link></header><ResultView check={check} /></>;
}