"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { startGoogleSignIn } from "@/lib/auth/client";
import { trackEvent } from "@/lib/telemetry/client";

export function GoogleSignIn({ nextPath, configured }: { nextPath: string; configured: boolean }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    trackEvent("login_started", { provider: "google" });
    trackEvent("signup_started", { provider: "google", intent: "authenticate" });
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Supabase authentication is not configured yet.");
      return;
    }

    setLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: signInError } = await startGoogleSignIn(supabase, redirectTo);

    if (signInError) {
      trackEvent("login_failed", { provider: "google" });
      setError("Google sign-in could not be started. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="button" type="button" onClick={signIn} disabled={loading || !configured} style={{ width: "100%" }}>
        {loading ? <LoaderCircle className="spin" size={19} /> : <GoogleMark />}
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
      {!configured && <p className="alert" style={{ marginTop: 14 }}>Authentication needs Supabase environment variables.</p>}
      {error && <p className="alert" role="alert" style={{ marginTop: 14 }}>{error}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.32 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.53l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}