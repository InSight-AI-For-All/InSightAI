import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPasswordlessCode, signOutLocally, startGoogleSignIn, verifyPasswordlessCode } from "./client";

function authClient() {
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: "test" } }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  return { client: { auth } as unknown as SupabaseClient, auth };
}

describe("multi-provider auth client", () => {
  it("keeps Google OAuth on the existing callback", async () => {
    const { client, auth } = authClient();
    await startGoogleSignIn(client, "https://insight.example/auth/callback?next=%2Fcheck");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://insight.example/auth/callback?next=%2Fcheck" } });
  });

  it("starts email sign-up with a Supabase-managed OTP and profile name", async () => {
    const { client, auth } = authClient();
    await sendPasswordlessCode(client, { method: "email", target: "person@example.com", fullName: "Taylor", emailRedirectTo: "https://insight.example/auth/callback" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "person@example.com", options: { shouldCreateUser: true, data: { full_name: "Taylor" }, emailRedirectTo: "https://insight.example/auth/callback" } });
  });

  it("starts phone sign-up with a Supabase-managed SMS OTP", async () => {
    const { client, auth } = authClient();
    await sendPasswordlessCode(client, { method: "phone", target: "+15551234567" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: "+15551234567", options: { shouldCreateUser: true, data: undefined, emailRedirectTo: undefined } });
  });

  it("verifies email and phone with provider-specific OTP types", async () => {
    const { client, auth } = authClient();
    await verifyPasswordlessCode(client, { method: "email", target: "person@example.com", code: "123456" });
    await verifyPasswordlessCode(client, { method: "phone", target: "+15551234567", code: "654321" });
    expect(auth.verifyOtp).toHaveBeenNthCalledWith(1, { email: "person@example.com", token: "123456", type: "email" });
    expect(auth.verifyOtp).toHaveBeenNthCalledWith(2, { phone: "+15551234567", token: "654321", type: "sms" });
  });

  it("signs out locally and clears pending sensitive session state", async () => {
    const { client, auth } = authClient();
    const storage = { removeItem: vi.fn() };
    await signOutLocally(client, storage);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(storage.removeItem).toHaveBeenCalledWith("insight.auth.pending");
    expect(storage.removeItem).toHaveBeenCalledWith("insight.telemetry.session");
  });
});