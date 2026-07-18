import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { GoogleSignIn } from "@/components/google-sign-in";
import { hasSupabaseEnvironment } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const parameters = await searchParams;
  const nextPath = parameters.next?.startsWith("/") ? parameters.next : "/dashboard";

  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="login-back"><ArrowLeft size={17} /> Back home</Link>
        <div>
          <p className="eyebrow" style={{ color: "#78e2b4" }}>Your clearer feed starts here</p>
          <h1>Pause the repost. Check the claim.</h1>
          <p>One account keeps every analysis, score, and next step ready when you need it.</p>
          <ul>
            <li><Check size={18} /> Five free evidence-assisted checks</li>
            <li><Check size={18} /> Private, searchable history</li>
            <li><Check size={18} /> Text, links, and screenshots</li>
          </ul>
        </div>
        <p className="login-safety"><ShieldCheck size={17} /> Results show uncertainty and never claim final authority.</p>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <Brand />
          <h2>Welcome to InSight</h2>
          <p className="muted">Sign in to check your first post and save the result.</p>
          {parameters.error && <p className="alert" role="alert">{parameters.error}</p>}
          <GoogleSignIn nextPath={nextPath} configured={hasSupabaseEnvironment()} />
          <p className="login-legal">By continuing, you agree to the <Link href="/terms">terms and safety notice</Link>.</p>
        </div>
      </section>
    </main>
  );
}