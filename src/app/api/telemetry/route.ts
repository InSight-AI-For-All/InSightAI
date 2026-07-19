import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRequestId, isRequestBodyTooLarge, isSameOriginRequest } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseUserAgent, safeReferrerHost } from "@/lib/telemetry/context";
import {
  recordError,
  recordPerformanceMetric,
  recordTelemetryEvent,
} from "@/lib/telemetry/server";
import { publicTelemetryEvents } from "@/lib/telemetry/types";

export const runtime = "nodejs";

const primitive = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const metadata = z.record(z.string().max(80), z.union([primitive, z.array(primitive).max(20)])).default({});
const common = {
  sessionId: z.string().uuid(),
  page: z.string().max(255).optional(),
  metadata,
};
const payloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), eventName: z.enum(publicTelemetryEvents), ...common }).strict(),
  z.object({
    kind: z.literal("performance"),
    metricName: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB", "route_transition"]),
    value: z.number().finite().min(0).max(3_600_000),
    rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
    ...common,
  }).strict(),
  z.object({
    kind: z.literal("error"),
    message: z.string().min(1).max(1_000),
    stack: z.string().max(8_000).optional(),
    ...common,
  }).strict(),
]);

const categories: Record<(typeof publicTelemetryEvents)[number], "acquisition" | "auth" | "navigation" | "product" | "billing"> = {
  first_visit: "acquisition",
  page_viewed: "navigation",
  session_started: "acquisition",
  session_ended: "acquisition",
  signup_started: "auth",
  login_started: "auth",
  login_completed: "auth",
  login_failed: "auth",
  pricing_viewed: "billing",
  upgrade_clicked: "billing",
  result_viewed: "product",
  result_shared: "product",
};

function acquisition(request: NextRequest) {
  const referrer = request.headers.get("referer");
  if (!referrer) return {};
  try {
    const url = new URL(referrer);
    return {
      referrerHost: safeReferrerHost(referrer),
      utmSource: url.searchParams.get("utm_source")?.slice(0, 120),
      utmMedium: url.searchParams.get("utm_medium")?.slice(0, 120),
      utmCampaign: url.searchParams.get("utm_campaign")?.slice(0, 120),
    };
  } catch {
    return { referrerHost: safeReferrerHost(referrer) };
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid origin.", requestId }, { status: 403 });
  }
  if (isRequestBodyTooLarge(request, 16 * 1024)) {
    return NextResponse.json({ error: "Telemetry payload is too large.", requestId }, { status: 413 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid telemetry payload.", requestId }, { status: 400 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("telemetry_events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", payload.sessionId)
      .gte("created_at", minuteAgo);
    if ((count || 0) >= 120) return new NextResponse(null, { status: 429 });

    const supabase = await createServerSupabaseClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const userId = data.user?.id || null;
    const userAgent = parseUserAgent(request.headers.get("user-agent"));
    const context = { ...userAgent, ...acquisition(request), page: payload.page, sessionId: payload.sessionId };

    if (payload.kind === "event") {
      await recordTelemetryEvent({
        eventName: payload.eventName,
        category: categories[payload.eventName],
        userId,
        requestId,
        context,
        metadata: payload.metadata,
      });
    } else if (payload.kind === "performance") {
      await recordPerformanceMetric({
        metricName: payload.metricName,
        value: payload.value,
        rating: payload.rating,
        route: payload.page,
        userId,
        context,
        metadata: payload.metadata,
      });
    } else {
      const error = new Error(payload.message);
      if (payload.stack) error.stack = payload.stack;
      await recordError({
        error,
        type: "client_error",
        severity: "error",
        page: payload.page,
        userId,
        requestId,
        context,
        metadata: payload.metadata,
      });
    }

    if (userId) {
      await admin.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
    }
    return new NextResponse(null, { status: 204, headers: { "X-Request-ID": requestId } });
  } catch {
    return new NextResponse(null, { status: 202, headers: { "X-Request-ID": requestId } });
  }
}