import "server-only";

import { getPlan } from "@/lib/plans";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminOverview = {
  rangeDays: number;
  users: { total_users: number; new_users_today: number; free_users: number; paid_users: number };
  active: { daily_active_users: number; monthly_active_users: number };
  factChecks: { attempts: number; attempts_today: number; completed: number; failed: number; success_rate: number; failure_rate: number; average_latency_ms: number };
  ai: { requests: number; failed: number; success_rate: number; average_latency_ms: number; total_tokens: number; estimated_cost_usd: number; parse_failures: number };
  revenue: { active_subscriptions: number; canceled_subscriptions: number; mrr_cents: number };
  errors: { today: number; mostCommon: { message: string; occurrences: number } | null };
  conversionRate: number;
  health: "healthy" | "degraded" | "critical";
  trend: Array<{ date: string; signups: number; fact_checks: number; errors: number; ai_cost: number; revenue_cents: number }>;
};

const defaultOverview: AdminOverview = {
  rangeDays: 30,
  users: { total_users: 0, new_users_today: 0, free_users: 0, paid_users: 0 },
  active: { daily_active_users: 0, monthly_active_users: 0 },
  factChecks: { attempts: 0, attempts_today: 0, completed: 0, failed: 0, success_rate: 0, failure_rate: 0, average_latency_ms: 0 },
  ai: { requests: 0, failed: 0, success_rate: 0, average_latency_ms: 0, total_tokens: 0, estimated_cost_usd: 0, parse_failures: 0 },
  revenue: { active_subscriptions: 0, canceled_subscriptions: 0, mrr_cents: 0 },
  errors: { today: 0, mostCommon: null },
  conversionRate: 0,
  health: "healthy",
  trend: [],
};

export function adminDateRange(value?: string) {
  const days = [1, 7, 30, 90, 365].includes(Number(value)) ? Number(value) : 30;
  return { days, from: new Date(Date.now() - days * 86_400_000).toISOString() };
}

export async function getAdminOverview(days = 30): Promise<AdminOverview> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_admin_overview", { p_days: days });
  if (error || !data) return { ...defaultOverview, rangeDays: days };
  return data as AdminOverview;
}

export async function getAdminUsers(filters: { query?: string; plan?: string; role?: string } = {}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("profiles")
    .select("id, email, phone, full_name, plan, role, auth_provider, auth_providers, created_at, last_active_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.plan && ["free", "starter", "pro", "max"].includes(filters.plan)) query = query.eq("plan", filters.plan);
  if (filters.role && ["user", "admin"].includes(filters.role)) query = query.eq("role", filters.role);
  if (filters.query?.trim()) query = query.or(`email.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%,full_name.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%`);
  const { data: profiles } = await query;
  const ids = (profiles || []).map((profile) => profile.id as string);
  if (!ids.length) return [];
  const [{ data: usage }, { data: checks }, { data: errors }, { data: subscriptions }] = await Promise.all([
    admin.from("usage_counters").select("user_id, free_used, monthly_used").in("user_id", ids),
    admin.from("fact_checks").select("user_id").in("user_id", ids).limit(20_000),
    admin.from("error_logs").select("user_id").in("user_id", ids).limit(20_000),
    admin.from("subscriptions").select("user_id, status").in("user_id", ids),
  ]);
  const countBy = (rows: Array<{ user_id: string | null }> | null) => (rows || []).reduce<Record<string, number>>((counts, row) => {
    if (row.user_id) counts[row.user_id] = (counts[row.user_id] || 0) + 1;
    return counts;
  }, {});
  const checkCounts = countBy(checks as Array<{ user_id: string }> | null);
  const errorCounts = countBy(errors as Array<{ user_id: string | null }> | null);
  const usageMap = new Map((usage || []).map((row) => [row.user_id, row]));
  const subscriptionMap = new Map((subscriptions || []).map((row) => [row.user_id, row.status]));
  return (profiles || []).map((profile) => ({
    ...profile,
    usage_count: profile.plan === "free" ? usageMap.get(profile.id)?.free_used || 0 : usageMap.get(profile.id)?.monthly_used || 0,
    fact_check_count: checkCounts[profile.id] || 0,
    error_count: errorCounts[profile.id] || 0,
    subscription_status: subscriptionMap.get(profile.id) || "inactive",
  }));
}

export async function getAdminUserDetail(id: string) {
  const admin = createAdminSupabaseClient();
  const [{ data: profile }, { data: usage }, { data: subscription }, { data: checks }, { data: events }, { data: errors }] = await Promise.all([
    admin.from("profiles").select("id, email, phone, full_name, plan, role, auth_provider, auth_providers, created_at, updated_at, last_active_at").eq("id", id).maybeSingle(),
    admin.from("usage_counters").select("free_used, monthly_used, reset_at, updated_at").eq("user_id", id).maybeSingle(),
    admin.from("subscriptions").select("plan, status, current_period_start, current_period_end, created_at, updated_at").eq("user_id", id).maybeSingle(),
    admin.from("fact_checks").select("id, input_type, verdict, truth_score, confidence_score, category, claim_type, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("telemetry_events").select("id, event_name, event_category, page, metadata, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("error_logs").select("id, error_type, severity, message, endpoint, page, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!profile) return null;
  return { profile, usage, subscription, checks: checks || [], events: events || [], errors: errors || [] };
}

export async function getTelemetryEvents(days: number, filters: { query?: string; event?: string } = {}) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  let query = admin.from("telemetry_events").select("id, event_name, event_category, user_id, session_id, page, browser, device_type, operating_system, referrer_host, metadata, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500);
  if (filters.event) query = query.eq("event_name", filters.event.slice(0, 120));
  if (filters.query?.trim()) query = query.or(`event_name.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%,page.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%`);
  const { data } = await query;
  return data || [];
}

export async function getAdminErrors(days: number, filters: { query?: string; severity?: string; type?: string } = {}) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  let query = admin.from("error_logs").select("id, fingerprint, error_type, severity, message, endpoint, page, user_id, request_id, browser, device_type, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500);
  if (filters.severity && ["info", "warning", "error", "critical"].includes(filters.severity)) query = query.eq("severity", filters.severity);
  if (filters.type) query = query.eq("error_type", filters.type.slice(0, 80));
  if (filters.query?.trim()) query = query.or(`message.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%,endpoint.ilike.%${filters.query.trim().replace(/[%(),]/g, "")}%`);
  const { data } = await query;
  return data || [];
}

export async function getAdminError(id: string) {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("error_logs").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function getAdminFactChecks(days: number, filters: { status?: string; inputType?: string; category?: string; user?: string } = {}) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  let query = admin.from("fact_check_logs").select("id, fact_check_id, user_id, request_id, input_type, stage, status, category, verdict, truth_score, confidence_score, duration_ms, error_code, error_reason, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500);
  if (filters.status && ["started", "completed", "failed", "rejected"].includes(filters.status)) query = query.eq("status", filters.status);
  if (filters.inputType && ["text", "link", "screenshot"].includes(filters.inputType)) query = query.eq("input_type", filters.inputType);
  if (filters.category) query = query.eq("category", filters.category.slice(0, 120));
  if (filters.user && /^[0-9a-f-]{36}$/i.test(filters.user)) query = query.eq("user_id", filters.user);
  const { data } = await query;
  return data || [];
}

export async function getAdminAi(days: number) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  const [{ data: ai }, { data: searches }] = await Promise.all([
    admin.from("ai_usage_logs").select("id, user_id, request_id, model, request_type, stage, status, latency_ms, prompt_tokens, cached_prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, retry_count, json_parse_failure, refusal, timed_out, error_code, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500),
    admin.from("web_search_logs").select("id, status, query_count, source_count, citation_count, latency_ms, failure_reason, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500),
  ]);
  return { ai: ai || [], searches: searches || [] };
}

export async function getAdminRevenue(days: number) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  const [{ data: events }, { data: subscriptions }] = await Promise.all([
    admin.from("billing_events").select("id, provider_event_id, event_name, user_id, plan, subscription_status, amount_cents, currency, success, error_code, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500),
    admin.from("subscriptions").select("user_id, plan, status, current_period_start, current_period_end, created_at, updated_at").order("updated_at", { ascending: false }).limit(500),
  ]);
  const active = (subscriptions || []).filter((row) => ["active", "trialing"].includes(row.status));
  const mrrCents = active.reduce((total, row) => total + Math.round(getPlan(row.plan).price * 100), 0);
  return { events: events || [], subscriptions: subscriptions || [], activeSubscriptions: active.length, mrrCents };
}

export async function getAdminPerformance(days: number) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  const [{ data: api }, { data: web }] = await Promise.all([
    admin.from("api_logs").select("id, endpoint, method, status_code, success, latency_ms, error_type, error_code, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(1_000),
    admin.from("performance_metrics").select("id, metric_name, value, rating, route, browser, device_type, operating_system, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(1_000),
  ]);
  return { api: api || [], web: web || [] };
}

export async function getAdminAudit(days: number) {
  const admin = createAdminSupabaseClient();
  const { from } = adminDateRange(String(days));
  const { data } = await admin.from("admin_audit_logs").select("id, admin_user_id, action, target_type, target_id, request_id, metadata, created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(500);
  return data || [];
}

export async function getAdminSettings() {
  const admin = createAdminSupabaseClient();
  const [{ data: rules }, { data: incidents }] = await Promise.all([
    admin.from("alert_rules").select("*").order("severity", { ascending: true }),
    admin.from("alert_incidents").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  return { rules: rules || [], incidents: incidents || [] };
}