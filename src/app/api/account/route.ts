import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const profileSchema = z.object({ fullName: z.string().trim().min(1).max(100) });

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile." }, { status: 400 });

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, updated_at: new Date().toISOString() }).eq("id", authData.user.id);
  if (error) return NextResponse.json({ error: "Profile could not be updated." }, { status: 500 });
  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });
  return NextResponse.json({ updated: true });
}