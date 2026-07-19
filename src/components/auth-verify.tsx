"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sendPasswordlessCode, verifyPasswordlessCode } from "@/lib/auth/client";
import { pendingAuthKey, type PendingAuth } from "@/components/auth-flow";
import { trackEvent } from "@/lib/telemetry/client";
import styles from "./auth-flow.module.css";

const resendSeconds = 60;

function maskedTarget(pending: PendingAuth) {
  if (pending.method === "email") {
    const [name, domain] = pending.target.split("@");
    return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
  return `${pending.target.slice(0, 3)} ••• ••• ${pending.target.slice(-4)}`;
}

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("expired")) return "That code has expired. Request a new one below.";
  if (normalized.includes("invalid") || normalized.includes("token")) return "That code is incorrect or no longer valid.";
  if (normalized.includes("rate") || normalized.includes("seconds")) return "Please wait before requesting another code.";
  return "We could not verify that code. Check it and try again.";
}

export function AuthVerify({ method, nextPath }: { method: "email" | "phone"; nextPath: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAuth | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(resendSeconds);
  const [state, setState] = useState<"idle" | "verifying" | "verified" | "resending">("idle");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(pendingAuthKey) || "null") as PendingAuth | null;
      if (!stored || stored.method !== method) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      setPending(stored);
      setCooldown(Math.max(0, resendSeconds - Math.floor((Date.now() - stored.sentAt) / 1_000)));
    } catch {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [method, nextPath, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !/^\d{6}$/.test(code)) {
      setError("Enter the complete six-digit code.");
      return;
    }
    if (attempts >= 5) {
      setError("Request a new code before trying again.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setState("verifying");
    setError("");
    const result = await verifyPasswordlessCode(supabase, { method: pending.method, target: pending.target, code });
    if (result.error || !result.data.session) {
      setAttempts((value) => value + 1);
      setError(friendlyError(result.error?.message || "Verification failed"));
      setState("idle");
      return;
    }
    setState("verified");
    trackEvent("login_completed", { provider: pending.method });
    window.sessionStorage.removeItem(pendingAuthKey);
    router.replace(pending.nextPath || nextPath);
    router.refresh();
  }

  async function resend() {
    if (!pending || cooldown > 0) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setState("resending");
    setError("");
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(pending.nextPath)}`;
    const result = await sendPasswordlessCode(supabase, { method: pending.method, target: pending.target, fullName: pending.fullName, emailRedirectTo });
    if (result.error) {
      setError(friendlyError(result.error.message));
      setState("idle");
      return;
    }
    const updated = { ...pending, sentAt: Date.now() };
    window.sessionStorage.setItem(pendingAuthKey, JSON.stringify(updated));
    setPending(updated);
    setCooldown(resendSeconds);
    setAttempts(0);
    setState("idle");
  }

  if (!pending) return <div className={styles.verifyLoading}><LoaderCircle className="spin" size={22} /> Restoring verification…</div>;

  return (
    <div className={styles.verify}>
      <div className={styles.verifyIcon}>{state === "verified" ? <Check size={25} /> : <span>6</span>}</div>
      <h2>{state === "verified" ? "You’re verified." : "Enter your code"}</h2>
      <p className="muted">Sent to <strong>{maskedTarget(pending)}</strong>{pending.method === "email" ? ". You can also use the secure link in the email." : "."}</p>
      <form className={styles.form} onSubmit={verify}>
        <label>Verification code<input className={`${styles.code} input`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} autoFocus /></label>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={state !== "idle" || code.length !== 6 || attempts >= 5}>{state === "verifying" ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{state === "verifying" ? "Verifying…" : "Verify and continue"}</button>
      </form>
      <button className={styles.resend} type="button" onClick={resend} disabled={cooldown > 0 || state !== "idle"}><RefreshCw size={15} /> {state === "resending" ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
      <Link className={styles.change} href={`/${pending.intent === "signup" ? "signup" : "login"}?next=${encodeURIComponent(pending.nextPath)}`}>Change {pending.method === "email" ? "email" : "phone number"}</Link>
    </div>
  );
}