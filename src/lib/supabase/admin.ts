import { createClient } from "@supabase/supabase-js";
import { ConfigurationError, getPublicSupabaseEnvironment, getServerEnvironment } from "@/lib/env";

export function createAdminSupabaseClient() {
  const environment = getPublicSupabaseEnvironment();
  if (!environment) throw new ConfigurationError("Supabase");

  const serviceRoleKey = getServerEnvironment().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new ConfigurationError("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(environment.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}