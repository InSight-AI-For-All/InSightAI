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

  return <><header className="page-heading"><div><Link href="/history" className="result-back"><ArrowLeft size={16} /> Your checks</Link><h1>Your InSight is ready.</h1><p>The score, context, and uncertainty — all in one place.</p></div><Link className="button secondary" href="/check"><Plus size={17} /> Check another</Link></header><ResultView check={check} /></>;
}