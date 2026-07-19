import { NextResponse, type NextRequest } from "next/server";
import { evaluateAdminAlerts } from "@/lib/admin/alerts";
import { getAdminUser } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/data";
import { getRequestId } from "@/lib/request-security";
import { recordAdminAudit, recordApiRequest, recordError } from "@/lib/telemetry/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const admin = await getAdminUser();
  if (!admin) {
    await recordApiRequest({ endpoint: "/api/admin/health", method: "GET", statusCode: 403, latencyMs: Date.now() - startedAt, requestId, errorType: "auth_error", errorCode: "ADMIN_REQUIRED" });
    return NextResponse.json({ error: "Administrator access is required.", code: "ADMIN_REQUIRED", requestId }, { status: 403, headers: { "X-Request-ID": requestId } });
  }

  try {
    const overview = await getAdminOverview(1);
    await evaluateAdminAlerts();
    await recordAdminAudit({ adminUserId: admin.id, action: "admin_health_viewed", requestId, targetType: "system", targetId: "health" });
    await recordApiRequest({ endpoint: "/api/admin/health", method: "GET", statusCode: 200, latencyMs: Date.now() - startedAt, userId: admin.id, requestId });
    return NextResponse.json({
      status: overview.health,
      checkedAt: new Date().toISOString(),
      database: "reachable",
      factChecks: { successRate: overview.factChecks.success_rate, averageLatencyMs: overview.factChecks.average_latency_ms },
      ai: { successRate: overview.ai.success_rate, averageLatencyMs: overview.ai.average_latency_ms },
      errorsToday: overview.errors.today,
      requestId,
    }, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
  } catch (error) {
    await recordError({ error, type: "database_error", severity: "critical", endpoint: "/api/admin/health", userId: admin.id, requestId });
    await recordApiRequest({ endpoint: "/api/admin/health", method: "GET", statusCode: 503, latencyMs: Date.now() - startedAt, userId: admin.id, requestId, errorType: "database_error", errorCode: "HEALTH_UNAVAILABLE" });
    return NextResponse.json({ status: "critical", error: "Health data is unavailable.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
  }
}