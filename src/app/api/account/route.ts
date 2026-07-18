import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestId, isRequestBodyTooLarge, isSameOriginRequest } from "@/lib/request-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const profileSchema = z.object({ fullName: z.string().trim().min(1).max(100) });

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "This request origin is not allowed.", code: "INVALID_ORIGIN", requestId }, { status: 403, headers: { "X-Request-ID": requestId } });
  if (isRequestBodyTooLarge(request, 16 * 1024)) return NextResponse.json({ error: "The profile update is too large.", code: "PAYLOAD_TOO_LARGE", requestId }, { status: 413, headers: { "X-Request-ID": requestId } });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Authentication is not configured.", code: "NOT_CONFIGURED", requestId }, { status: 503, headers: { "X-Request-ID": requestId } });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Sign in required.", code: "UNAUTHORIZED", requestId }, { status: 401, headers: { "X-Request-ID": requestId } });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile.", code: "INVALID_PROFILE", requestId }, { status: 400, headers: { "X-Request-ID": requestId } });

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, updated_at: new Date().toISOString() }).eq("id", authData.user.id);
  if (error) return NextResponse.json({ error: "Profile could not be updated.", code: "PROFILE_UPDATE_FAILED", requestId }, { status: 500, headers: { "X-Request-ID": requestId } });
  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });
  return NextResponse.json({ updated: true }, { headers: { "X-Request-ID": requestId } });
}