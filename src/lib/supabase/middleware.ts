import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnvironment } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { getLoginDestination, isProtectedAppPath } from "@/lib/auth-redirect";

export async function refreshSession(request: NextRequest) {
  const environment = getPublicSupabaseEnvironment();
  if (!environment) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(environment.url, environment.anonKey, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (isProtectedAppPath(request.nextUrl.pathname) && !data?.claims?.sub) {
    const loginUrl = getLoginDestination(request.nextUrl);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }
  return response;
}