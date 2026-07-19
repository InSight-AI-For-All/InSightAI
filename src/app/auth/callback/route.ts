import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectDestination } from "@/lib/auth-redirect";
import { getAppUrl } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordError, recordTelemetryEvent } from "@/lib/telemetry/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next") || "/dashboard";
  const appUrl = getAppUrl();
  const safeDestination = getSafeRedirectDestination(requestedPath, appUrl);
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(
      new URL("/login?error=Authentication%20is%20not%20configured", appUrl),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Could%20not%20complete%20sign-in", appUrl),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    await recordTelemetryEvent({ eventName: "login_failed", category: "auth", metadata: { provider: "google", stage: "callback" } });
    await recordError({ error, type: "auth_error", severity: "warning", endpoint: "/auth/callback", metadata: { provider: "google" } });
    return NextResponse.redirect(
      new URL("/login?error=Could%20not%20complete%20sign-in", appUrl),
    );
  }

  const { data } = await supabase.auth.getUser();
  await recordTelemetryEvent({ eventName: "login_completed", category: "auth", userId: data.user?.id, metadata: { provider: "google" } });

  return NextResponse.redirect(safeDestination);
}