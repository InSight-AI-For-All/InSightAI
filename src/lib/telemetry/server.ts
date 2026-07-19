import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  ClientContext,
  ErrorSeverity,
  ErrorType,
  SafeMetadata,
  SafeMetadataValue,
  TelemetryCategory,
} from "@/lib/telemetry/types";

const secretKeyPattern = /(authorization|cookie|password|secret|token|api.?key|signature|card|payment.?method|raw.?text|prompt|image|screenshot|submitted.?url)/i;
const secretValuePatterns = [
  /sk-(?:proj-)?[a-z0-9_-]{12,}/gi,
  /sb_secret_[a-z0-9_-]{8,}/gi,
  /whsec_[a-z0-9_-]{8,}/gi,
  /bearer\s+[a-z0-9._~-]+/gi,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/g,
];

function environmentName() {
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.RENDER_GIT_COMMIT) return "production";
  return "production";
}

function redact(value: string, maximum = 500) {
  let result = value.slice(0, maximum);
  for (const pattern of secretValuePatterns) result = result.replace(pattern, "[REDACTED]");
  return result;
}

function primitive(value: unknown): SafeMetadataValue | SafeMetadataValue[] | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return redact(value, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => primitive(item)).filter((item): item is SafeMetadataValue => !Array.isArray(item) && item !== undefined);
  }
  return undefined;
}

export function sanitizeMetadata(metadata: Record<string, unknown> = {}): SafeMetadata {
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 40)
      .filter(([key]) => !secretKeyPattern.test(key))
      .map(([key, value]) => [key.slice(0, 80), primitive(value)] as const)
      .filter((entry): entry is [string, SafeMetadataValue | SafeMetadataValue[]] => entry[1] !== undefined),
  );
}

function safeText(value: string | null | undefined, maximum = 500) {
  return value ? redact(value, maximum) : null;
}

async function insert(table: string, row: Record<string, unknown>) {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from(table).insert(row).select("id").maybeSingle();
    if (error) return null;
    return data?.id ?? true;
  } catch {
    return null;
  }
}

async function update(table: string, id: string | number, row: Record<string, unknown>) {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from(table).update(row).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function recordTelemetryEvent(input: {
  eventName: string;
  category: TelemetryCategory;
  userId?: string | null;
  requestId?: string | null;
  context?: ClientContext;
  metadata?: Record<string, unknown>;
}) {
  const context = input.context || {};
  return insert("telemetry_events", {
    event_name: input.eventName.slice(0, 120),
    event_category: input.category,
    user_id: input.userId || null,
    session_id: context.sessionId || null,
    request_id: safeText(input.requestId, 120),
    page: safeText(context.page, 255),
    environment: environmentName(),
    device_type: safeText(context.deviceType, 40),
    browser: safeText(context.browser, 80),
    operating_system: safeText(context.operatingSystem, 80),
    referrer_host: safeText(context.referrerHost, 255),
    utm_source: safeText(context.utmSource, 120),
    utm_medium: safeText(context.utmMedium, 120),
    utm_campaign: safeText(context.utmCampaign, 120),
    metadata: sanitizeMetadata(input.metadata),
  });
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name.slice(0, 120),
      message: redact(error.message || "Unknown error", 1_000),
      stack: error.stack ? redact(error.stack, 8_000) : null,
    };
  }
  return { name: "UnknownError", message: "Unknown error", stack: null };
}

export async function recordError(input: {
  error: unknown;
  type?: ErrorType;
  severity?: ErrorSeverity;
  endpoint?: string;
  page?: string;
  userId?: string | null;
  requestId?: string | null;
  context?: ClientContext;
  metadata?: Record<string, unknown>;
}) {
  const details = errorDetails(input.error);
  const fingerprint = createHash("sha256")
    .update(`${input.type || "unknown_error"}|${details.name}|${details.message}|${input.endpoint || input.page || "unknown"}`)
    .digest("hex");
  return insert("error_logs", {
    fingerprint,
    error_type: input.type || "unknown_error",
    severity: input.severity || "error",
    message: details.message,
    stack_trace: details.stack,
    endpoint: safeText(input.endpoint, 255),
    page: safeText(input.page || input.context?.page, 255),
    user_id: input.userId || null,
    session_id: input.context?.sessionId || null,
    request_id: safeText(input.requestId, 120),
    browser: safeText(input.context?.browser, 80),
    device_type: safeText(input.context?.deviceType, 40),
    operating_system: safeText(input.context?.operatingSystem, 80),
    environment: environmentName(),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function recordApiRequest(input: {
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  userId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  errorType?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return insert("api_logs", {
    endpoint: input.endpoint.slice(0, 255),
    method: input.method,
    status_code: input.statusCode,
    success: input.statusCode < 400,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    user_id: input.userId || null,
    session_id: input.sessionId || null,
    request_id: safeText(input.requestId, 120),
    error_type: safeText(input.errorType, 80),
    error_code: safeText(input.errorCode, 120),
    environment: environmentName(),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function startFactCheckLog(input: {
  userId: string;
  requestId: string;
  sessionId?: string | null;
  inputType: string;
  stage?: string;
  reservationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = await insert("fact_check_logs", {
    user_id: input.userId,
    request_id: input.requestId,
    session_id: input.sessionId || null,
    input_type: input.inputType,
    stage: input.stage || "submission",
    status: "started",
    reservation_id: input.reservationId || null,
    environment: environmentName(),
    metadata: sanitizeMetadata(input.metadata),
  });
  return typeof id === "string" ? id : null;
}

export async function completeFactCheckLog(id: string | null, input: {
  factCheckId?: string | null;
  stage: string;
  status: "completed" | "failed" | "rejected";
  durationMs: number;
  category?: string | null;
  verdict?: string | null;
  truthScore?: number | null;
  confidenceScore?: number | null;
  errorCode?: string | null;
  errorReason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!id) return false;
  return update("fact_check_logs", id, {
    fact_check_id: input.factCheckId || null,
    stage: input.stage,
    status: input.status,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    category: safeText(input.category, 120),
    verdict: safeText(input.verdict, 120),
    truth_score: input.truthScore ?? null,
    confidence_score: input.confidenceScore ?? null,
    error_code: safeText(input.errorCode, 120),
    error_reason: safeText(input.errorReason, 500),
    metadata: sanitizeMetadata(input.metadata),
    completed_at: new Date().toISOString(),
  });
}

export async function recordAiUsage(input: {
  factCheckLogId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  model: string;
  requestType: string;
  stage: string;
  status: "started" | "completed" | "failed";
  latencyMs?: number;
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  retryCount?: number;
  jsonParseFailure?: boolean;
  refusal?: boolean;
  timedOut?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = await insert("ai_usage_logs", {
    fact_check_log_id: input.factCheckLogId || null,
    user_id: input.userId || null,
    request_id: safeText(input.requestId, 120),
    model: input.model.slice(0, 120),
    request_type: input.requestType.slice(0, 120),
    stage: input.stage.slice(0, 120),
    status: input.status,
    latency_ms: input.latencyMs === undefined ? null : Math.max(0, Math.round(input.latencyMs)),
    prompt_tokens: Math.max(0, input.promptTokens || 0),
    cached_prompt_tokens: Math.max(0, input.cachedPromptTokens || 0),
    completion_tokens: Math.max(0, input.completionTokens || 0),
    estimated_cost_usd: Math.max(0, input.estimatedCostUsd || 0),
    retry_count: Math.max(0, input.retryCount || 0),
    json_parse_failure: Boolean(input.jsonParseFailure),
    refusal: Boolean(input.refusal),
    timed_out: Boolean(input.timedOut),
    error_code: safeText(input.errorCode, 120),
    metadata: sanitizeMetadata(input.metadata),
  });
  return typeof id === "number" ? id : null;
}

export async function recordWebSearch(input: {
  aiUsageLogId?: number | null;
  factCheckLogId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  status: "started" | "completed" | "failed";
  queryCount?: number;
  sourceCount?: number;
  citationCount?: number;
  latencyMs?: number;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return insert("web_search_logs", {
    ai_usage_log_id: input.aiUsageLogId || null,
    fact_check_log_id: input.factCheckLogId || null,
    user_id: input.userId || null,
    request_id: safeText(input.requestId, 120),
    status: input.status,
    query_count: Math.max(0, input.queryCount || 0),
    source_count: Math.max(0, input.sourceCount || 0),
    citation_count: Math.max(0, input.citationCount || 0),
    latency_ms: input.latencyMs === undefined ? null : Math.max(0, Math.round(input.latencyMs)),
    failure_reason: safeText(input.failureReason, 500),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function recordBillingEvent(input: {
  eventName: string;
  providerEventId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  plan?: string | null;
  subscriptionStatus?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  success?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return insert("billing_events", {
    event_name: input.eventName.slice(0, 120),
    provider_event_id: safeText(input.providerEventId, 255),
    user_id: input.userId || null,
    request_id: safeText(input.requestId, 120),
    plan: safeText(input.plan, 80),
    subscription_status: safeText(input.subscriptionStatus, 80),
    amount_cents: input.amountCents ?? null,
    currency: safeText(input.currency, 10),
    success: input.success !== false,
    error_code: safeText(input.errorCode, 120),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function recordPerformanceMetric(input: {
  metricName: string;
  value: number;
  rating?: string | null;
  route?: string | null;
  userId?: string | null;
  context?: ClientContext;
  metadata?: Record<string, unknown>;
}) {
  return insert("performance_metrics", {
    metric_name: input.metricName,
    value: Math.max(0, input.value),
    rating: safeText(input.rating, 40),
    route: safeText(input.route, 255),
    user_id: input.userId || null,
    session_id: input.context?.sessionId || null,
    browser: safeText(input.context?.browser, 80),
    device_type: safeText(input.context?.deviceType, 40),
    operating_system: safeText(input.context?.operatingSystem, 80),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function recordAdminAudit(input: {
  adminUserId: string;
  action: string;
  requestId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return insert("admin_audit_logs", {
    admin_user_id: input.adminUserId,
    action: input.action.slice(0, 120),
    request_id: safeText(input.requestId, 120),
    target_type: safeText(input.targetType, 120),
    target_id: safeText(input.targetId, 255),
    metadata: sanitizeMetadata(input.metadata),
  });
}