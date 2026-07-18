import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnvironment } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabaseClient() {
  const environment = getPublicSupabaseEnvironment();
  if (!environment) return null;

  browserClient ??= createBrowserClient(environment.url, environment.anonKey);
  return browserClient;
}