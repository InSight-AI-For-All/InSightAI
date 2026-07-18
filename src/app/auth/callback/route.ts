import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next") || "/dashboard";
  const safePath = requestedPath.startsWith("/") ? requestedPath : "/dashboard";
  const supabase = await createServerSupabaseClient();

  if (!code || !supabase) {
    return NextResponse.redirect(
      new URL("/login?error=Authentication%20is%20not%20configured", getAppUrl()),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=Could%20not%20complete%20sign-in", getAppUrl()),
    );
  }

  return NextResponse.redirect(new URL(safePath, getAppUrl()));
}