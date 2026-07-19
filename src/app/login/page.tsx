import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthFlow } from "@/components/auth-flow";
import { hasSupabaseEnvironment } from "@/lib/env";
import { getAuthCapabilities } from "@/lib/auth/capabilities";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const parameters = await searchParams;
  const capabilities = await getAuthCapabilities();
  const nextPath = parameters.next?.startsWith("/") && !parameters.next.startsWith("//") ? parameters.next : "/dashboard";

  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="login-back"><ArrowLeft size={17} /> Back home</Link>
        <div>
          <p className="eyebrow">Your clearer feed starts here</p>
          <h1>Your feed has questions. Bring them.</h1>
          <p>Three free checks. Every score, explanation, and next step saved privately.</p>
          <ul>
            <li><Check size={18} /> Three free evidence-assisted checks</li>
            <li><Check size={18} /> Private, searchable history</li>
            <li><Check size={18} /> Text, links, and screenshots</li>
          </ul>
        </div>
        <p className="login-safety"><ShieldCheck size={17} /> Results show uncertainty and never claim final authority.</p>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <Brand />
          <h2>Let&apos;s check that post.</h2>
          <p className="muted">Use Google, email, or your phone. No password to remember.</p>
          {parameters.error && <p className="alert" role="alert">{parameters.error}</p>}
          <AuthFlow nextPath={nextPath} configured={hasSupabaseEnvironment()} intent="signin" capabilities={capabilities} />
          <p className="login-legal">By continuing, you agree to the <Link href="/terms">terms and safety notice</Link>.</p>
        </div>
      </section>
    </main>
  );
}