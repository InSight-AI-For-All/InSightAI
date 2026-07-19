import type { SupabaseClient } from "@supabase/supabase-js";

export type PasswordlessMethod = "email" | "phone";

export async function sendPasswordlessCode(client: SupabaseClient, input: { method: PasswordlessMethod; target: string; fullName?: string; emailRedirectTo?: string }) {
  const options = { shouldCreateUser: true, data: input.fullName ? { full_name: input.fullName } : undefined, emailRedirectTo: input.emailRedirectTo };
  return input.method === "email"
    ? client.auth.signInWithOtp({ email: input.target, options })
    : client.auth.signInWithOtp({ phone: input.target, options });
}

export async function verifyPasswordlessCode(client: SupabaseClient, input: { method: PasswordlessMethod; target: string; code: string }) {
  return input.method === "email"
    ? client.auth.verifyOtp({ email: input.target, token: input.code, type: "email" })
    : client.auth.verifyOtp({ phone: input.target, token: input.code, type: "sms" });
}

export async function startGoogleSignIn(client: SupabaseClient, redirectTo: string) {
  return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}

export async function signOutLocally(client: SupabaseClient, storage?: Pick<Storage, "removeItem">) {
  const result = await client.auth.signOut({ scope: "local" });
  storage?.removeItem("insight.telemetry.session");
  storage?.removeItem("insight.auth.pending");
  return result;
}