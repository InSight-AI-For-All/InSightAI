import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AuthVerify } from "@/components/auth-verify";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Verify your account" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ method?: string; next?: string }> }) {
  const parameters = await searchParams;
  const method = parameters.method === "phone" ? "phone" : "email";
  const nextPath = parameters.next?.startsWith("/") && !parameters.next.startsWith("//") ? parameters.next : "/dashboard";
  return <main className="login-page"><section className="login-story"><Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="login-back"><ArrowLeft size={17} /> Back to sign in</Link><div><p className="eyebrow">A quick security check</p><h1>Verify once. Keep moving.</h1><p>Your code confirms that this email or phone belongs to you.</p></div><p className="login-safety"><ShieldCheck size={17} /> Codes are managed and protected by Supabase Auth.</p></section><section className="login-form-wrap"><div className="login-form"><Brand /><AuthVerify method={method} nextPath={nextPath} /></div></section></main>;
}