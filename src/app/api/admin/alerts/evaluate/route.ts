import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateAdminAlerts } from "@/lib/admin/alerts";
import { getRequestId } from "@/lib/request-security";
import { recordApiRequest, recordError } from "@/lib/telemetry/server";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.ADMIN_CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized.", requestId }, { status: 401, headers: { "X-Request-ID": requestId } });
  try {
    const changes = await evaluateAdminAlerts();
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl && changes.length) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.ALERT_WEBHOOK_SECRET) headers.Authorization = `Bearer ${process.env.ALERT_WEBHOOK_SECRET}`;
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ source: "insight-ai", occurredAt: new Date().toISOString(), changes }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Alert webhook returned ${response.status}`);
    }
    await recordApiRequest({ endpoint: "/api/admin/alerts/evaluate", method: "POST", statusCode: 200, latencyMs: Date.now() - startedAt, requestId, metadata: { changes: changes.length } });
    return NextResponse.json({ status: "ok", evaluatedAt: new Date().toISOString(), changes: changes.length, requestId }, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
  } catch (error) {
    await recordError({ error, type: "api_error", severity: "critical", endpoint: "/api/admin/alerts/evaluate", requestId });
    await recordApiRequest({ endpoint: "/api/admin/alerts/evaluate", method: "POST", statusCode: 503, latencyMs: Date.now() - startedAt, requestId, errorType: "api_error", errorCode: "ALERT_EVALUATION_FAILED" });
    return NextResponse.json({ error: "Alert evaluation failed.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
  }
}