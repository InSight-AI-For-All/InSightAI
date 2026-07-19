import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/request-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordTelemetryEvent } from "@/lib/telemetry/server";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "This request origin is not allowed.", code: "INVALID_ORIGIN" }, { status: 403 });
  }
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    await recordTelemetryEvent({ eventName: "logout", category: "auth", userId: data.user?.id });
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}