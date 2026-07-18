import type { Metadata } from "next";
import { FactCheckForm } from "@/components/fact-check-form";
import { getServerEnvironment } from "@/lib/env";

export const metadata: Metadata = { title: "New check" };

export default function CheckPage() {
  const environment = getServerEnvironment();
  const configured = Boolean(environment.SUPABASE_SERVICE_ROLE_KEY && environment.OPENAI_API_KEY);
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">New InSight</p><h1>Drop what made you pause.</h1><p>Text, link, or screenshot. We&apos;ll separate the signal from the noise.</p></div></header>
      <FactCheckForm configured={configured} />
    </>
  );
}