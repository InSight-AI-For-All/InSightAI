import type { Metadata } from "next";
import { FactCheckForm } from "@/components/fact-check-form";

export const metadata: Metadata = { title: "New check" };

export default function CheckPage() {
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">New analysis</p><h1>What caught your eye?</h1><p>Bring the post. We’ll help you slow it down.</p></div></header>
      <FactCheckForm />
    </>
  );
}