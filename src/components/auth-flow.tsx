"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mail, Phone } from "lucide-react";
import { z } from "zod";
import { GoogleSignIn } from "@/components/google-sign-in";
import { sendPasswordlessCode } from "@/lib/auth/client";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/telemetry/client";
import type { AuthCapabilities } from "@/lib/auth/capabilities";
import styles from "./auth-flow.module.css";

export type AuthMethod = "email" | "phone";
export type PendingAuth = {
  method: AuthMethod;
  target: string;
  nextPath: string;
  intent: "signin" | "signup";
  fullName?: string;
  sentAt: number;
};

export const pendingAuthKey = "insight.auth.pending";
const emailSchema = z.string().trim().email().max(254);
const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/);

function normalizePhone(value: string) {
  return value.replace(/[\s().-]/g, "");
}

export function AuthFlow({ nextPath, configured, intent, capabilities }: { nextPath: string; configured: boolean; intent: "signin" | "signup"; capabilities: AuthCapabilities }) {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>(capabilities.email ? "email" : "phone");
  const [target, setTarget] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Authentication is not available right now.");
      return;
    }
    const normalized = method === "phone" ? normalizePhone(target) : target.trim().toLowerCase();
    const valid = method === "email" ? emailSchema.safeParse(normalized).success : phoneSchema.safeParse(normalized).success;
    if (!valid) {
      setError(method === "email" ? "Enter a valid email address." : "Use international format, including + and country code.");
      return;
    }
    if (intent === "signup" && !fullName.trim()) {
      setError("Enter your name to create your account.");
      return;
    }

    setLoading(true);
    setError("");
    trackEvent(intent === "signup" ? "signup_started" : "login_started", { provider: method });
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const result = await sendPasswordlessCode(supabase, { method, target: normalized, fullName: fullName.trim() || undefined, emailRedirectTo });
    if (result.error) {
      trackEvent("login_failed", { provider: method });
      setError("We could not send a code right now. Wait a moment and try again.");
      setLoading(false);
      return;
    }

    const pending: PendingAuth = { method, target: normalized, nextPath, intent, fullName: fullName.trim() || undefined, sentAt: Date.now() };
    window.sessionStorage.setItem(pendingAuthKey, JSON.stringify(pending));
    router.push(`/verify?method=${method}&next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <div className={styles.flow}>
      {capabilities.google && <GoogleSignIn nextPath={nextPath} configured={configured} />}
      <div className={styles.divider}><span>or continue with</span></div>
      <div className={styles.tabs} role="tablist" aria-label="Sign-in method">
        <button type="button" role="tab" aria-selected={method === "email"} disabled={!capabilities.email} onClick={() => { setMethod("email"); setError(""); }}><Mail size={17} /> Email</button>
        <button type="button" role="tab" aria-selected={method === "phone"} disabled={!capabilities.phone} onClick={() => { setMethod("phone"); setError(""); }}><Phone size={17} /> Phone{!capabilities.phone ? " · soon" : ""}</button>
      </div>
      <form className={styles.form} onSubmit={sendCode}>
        {intent === "signup" && <label>Full name<input className="input" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} placeholder="How should we greet you?" /></label>}
        <label>
          {method === "email" ? "Email address" : "Mobile number"}
          <input
            className="input"
            type={method === "email" ? "email" : "tel"}
            inputMode={method === "email" ? "email" : "tel"}
            autoComplete={method === "email" ? "email" : "tel"}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={method === "email" ? "you@example.com" : "+1 555 123 4567"}
            maxLength={method === "email" ? 254 : 24}
          />
        </label>
        <p className={styles.hint}>{method === "email" ? "We’ll email a secure code or sign-in link." : "We’ll text a one-time verification code. Carrier rates may apply."}</p>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={loading || !configured || !capabilities[method]}>
          {loading ? <LoaderCircle className="spin" size={18} /> : method === "email" ? <Mail size={18} /> : <Phone size={18} />}
          {loading ? "Sending code…" : intent === "signup" ? "Create account" : "Continue"}
        </button>
      </form>
      <p className={styles.switch}>{intent === "signup" ? <>Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link></> : <>New to InSight? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link></>}</p>
      {!configured && <p className="alert">Authentication needs Supabase environment variables.</p>}
      {!capabilities.email && method === "email" && <p className="alert">Email sign-in is not enabled in Supabase yet.</p>}
    </div>
  );
}