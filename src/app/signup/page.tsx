import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { AuthFlow } from "@/components/auth-flow";
import { Brand } from "@/components/brand";
import { hasSupabaseEnvironment } from "@/lib/env";
import { getAuthCapabilities } from "@/lib/auth/capabilities";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const parameters = await searchParams;
  const capabilities = await getAuthCapabilities();
  const nextPath = parameters.next?.startsWith("/") && !parameters.next.startsWith("//") ? parameters.next : "/dashboard";
  return <main className="login-page"><section className="login-story"><Link href="/" className="login-back"><ArrowLeft size={17} /> Back home</Link><div><p className="eyebrow">Start with a clearer signal</p><h1>One account. Every claim you check.</h1><p>Create your private workspace in under a minute.</p><ul><li><Check size={18} /> Three free evidence-assisted checks</li><li><Check size={18} /> Verified email or mobile identity</li><li><Check size={18} /> Private, searchable history</li></ul></div><p className="login-safety"><ShieldCheck size={17} /> We never store passwords or verification codes.</p></section><section className="login-form-wrap"><div className="login-form"><Brand /><h2>Create your account.</h2><p className="muted">Choose the sign-up method that works for you.</p><AuthFlow nextPath={nextPath} configured={hasSupabaseEnvironment()} intent="signup" capabilities={capabilities} /><p className="login-legal">By continuing, you agree to the <Link href="/terms">terms and safety notice</Link>.</p></div></section></main>;
}