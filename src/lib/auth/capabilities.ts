import "server-only";

import { getPublicSupabaseEnvironment } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export type AuthCapabilities = { google: boolean; email: boolean; phone: boolean };

export async function getAuthCapabilities(): Promise<AuthCapabilities> {
  const environment = getPublicSupabaseEnvironment();
  if (!environment) return { google: false, email: false, phone: false };
  try {
    const response = await fetchWithTimeout(`${environment.url}/auth/v1/settings`, {
      headers: { apikey: environment.anonKey },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Auth settings unavailable");
    const settings = await response.json() as { external?: Record<string, boolean>; sms_provider?: string };
    return {
      google: Boolean(settings.external?.google),
      email: Boolean(settings.external?.email),
      phone: Boolean(settings.sms_provider),
    };
  } catch {
    return { google: true, email: true, phone: false };
  }
}