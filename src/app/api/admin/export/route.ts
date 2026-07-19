import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/auth";
import { getRequestId } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAudit, recordApiRequest } from "@/lib/telemetry/server";

export const runtime = "nodejs";

const typeSchema = z.enum(["telemetry", "errors", "fact-checks", "ai", "billing"]);

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Administrator access is required.", code: "ADMIN_REQUIRED", requestId }, { status: 403 });
  const parsed = typeSchema.safeParse(request.nextUrl.searchParams.get("type"));
  if (!parsed.success) return NextResponse.json({ error: "Unsupported export type.", requestId }, { status: 400 });
  const days = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("days") || 30), 365));
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const definitions = {
    telemetry: { table: "telemetry_events", columns: "id,event_name,event_category,user_id,session_id,page,environment,device_type,browser,operating_system,referrer_host,utm_source,utm_medium,utm_campaign,created_at" },
    errors: { table: "error_logs", columns: "id,fingerprint,error_type,severity,message,endpoint,page,user_id,request_id,browser,device_type,operating_system,created_at" },
    "fact-checks": { table: "fact_check_logs", columns: "id,fact_check_id,user_id,request_id,input_type,stage,status,category,verdict,truth_score,confidence_score,duration_ms,error_code,created_at" },
    ai: { table: "ai_usage_logs", columns: "id,user_id,request_id,provider,model,request_type,stage,status,latency_ms,prompt_tokens,cached_prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,retry_count,json_parse_failure,refusal,timed_out,error_code,created_at" },
    billing: { table: "billing_events", columns: "id,provider_event_id,event_name,user_id,plan,subscription_status,amount_cents,currency,success,error_code,created_at" },
  } as const;
  const definition = definitions[parsed.data];
  const db = createAdminSupabaseClient();
  const { data, error } = await db.from(definition.table as "telemetry_events").select(definition.columns as "*").gte("created_at", from).order("created_at", { ascending: false }).limit(5_000);
  if (error) return NextResponse.json({ error: "The export could not be generated.", requestId }, { status: 500 });
  const rows = (data || []) as unknown as Array<Record<string, unknown>>;
  const columns = definition.columns.split(",");
  const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  await recordAdminAudit({ adminUserId: adminUser.id, action: "admin_data_exported", requestId, targetType: "dataset", targetId: parsed.data, metadata: { days, rows: rows.length } });
  await recordApiRequest({ endpoint: "/api/admin/export", method: "GET", statusCode: 200, latencyMs: Date.now() - startedAt, userId: adminUser.id, requestId, metadata: { type: parsed.data, rows: rows.length } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="insight-${parsed.data}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Request-ID": requestId } });
}