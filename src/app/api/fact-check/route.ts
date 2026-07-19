import { NextResponse, type NextRequest } from "next/server";
import { ConfigurationError } from "@/lib/env";
import { getServerEnvironment } from "@/lib/env";
import { analyzeFactCheck, FactCheckAnalysisError } from "@/lib/fact-check/provider";
import { factCheckResultSchema, factCheckSubmissionSchema } from "@/lib/fact-check/schema";
import { cacheTtlHours, getFactCheckConfig } from "@/lib/fact-check/config";
import { extractCandidateText, inputLimitForPlan, normalizedContentHash } from "@/lib/fact-check/cost-controls";
import {
  getRequestId,
  hasValidImageSignature,
  isRequestBodyTooLarge,
  isSameOriginRequest,
  maxFactCheckRequestBytes,
} from "@/lib/request-security";
import { getErrorName, logServerError } from "@/lib/server-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  completeFactCheckLog,
  recordAiUsage,
  recordApiRequest,
  recordError,
  recordPerformanceMetric,
  recordTelemetryEvent,
  startFactCheckLog,
} from "@/lib/telemetry/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

type Reservation = {
  allowed: boolean;
  status: string;
  reservationId?: string;
  factCheckId?: string;
  used?: number;
  limit?: number;
};

type RateLimit = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type UserCostProfile = { plan: string; role: string };

function responseHeaders(requestId: string, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("X-Request-ID", requestId);
  return result;
}

function errorResponse(message: string, status: number, code: string, requestId: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message, code, requestId }, {
    status,
    headers: responseHeaders(requestId, headers),
  });
}

async function handlePost(request: NextRequest, requestId: string) {
  const requestStartedAt = Date.now();
  if (!isSameOriginRequest(request)) {
    return errorResponse("This request origin is not allowed.", 403, "INVALID_ORIGIN", requestId);
  }
  if (isRequestBodyTooLarge(request, maxFactCheckRequestBytes)) {
    return errorResponse("The submission is too large.", 413, "PAYLOAD_TOO_LARGE", requestId);
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return errorResponse("Authentication is not configured.", 503, "NOT_CONFIGURED", requestId);

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return errorResponse("Sign in to run a fact check.", 401, "UNAUTHORIZED", requestId);

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(error.message, 503, "NOT_CONFIGURED", requestId);
    throw error;
  }

  const { data: costProfile, error: costProfileError } = await admin
    .from("profiles")
    .select("plan, role")
    .eq("id", user.id)
    .single();
  if (costProfileError || !costProfile) return errorResponse("Usage could not be verified.", 500, "USAGE_ERROR", requestId);
  const profile = costProfile as UserCostProfile;
  const costConfig = getFactCheckConfig(getServerEnvironment());

  const { data: rateLimitData, error: rateLimitError } = await admin.rpc(
    "check_fact_check_rate_limit",
    { p_user_id: user.id },
  );
  if (rateLimitError) {
    logServerError("fact_check.rate_limit_failed", { requestId, errorName: rateLimitError.name });
    return errorResponse("Request limits could not be verified. Try again shortly.", 503, "RATE_LIMIT_UNAVAILABLE", requestId);
  }
  const rateLimit = rateLimitData as RateLimit;
  if (!rateLimit.allowed) {
    return errorResponse("Too many requests. Try again shortly.", 429, "RATE_LIMITED", requestId, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "X-RateLimit-Remaining": "0",
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("The submission could not be read.", 400, "INVALID_FORM", requestId);
  }

  const submissionResult = factCheckSubmissionSchema.safeParse({
    inputType: formData.get("inputType"),
    text: formData.get("text") || "",
    url: formData.get("url") || "",
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!submissionResult.success) {
    await recordTelemetryEvent({
      eventName: "input_validation_failed",
      category: "product",
      userId: user.id,
      requestId,
      metadata: { errorCode: "INVALID_INPUT" },
    });
    await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: 400, latencyMs: Date.now() - requestStartedAt, userId: user.id, requestId, errorType: "api_error", errorCode: "INVALID_INPUT" });
    return errorResponse(
      submissionResult.error.issues[0]?.message || "Check the submitted content.",
      400,
      "INVALID_INPUT",
      requestId,
    );
  }

  const submission = submissionResult.data;
  const inputLimit = profile.role === "admin" ? costConfig.maxInputChars : inputLimitForPlan(profile.plan, costConfig.maxInputChars);
  const reducedText = extractCandidateText(submission.text, inputLimit);
  const analysisSubmission = { ...submission, text: reducedText.text };
  const rawSessionId = formData.get("telemetrySessionId");
  const sessionId = typeof rawSessionId === "string" && /^[0-9a-f-]{36}$/i.test(rawSessionId) ? rawSessionId : null;
  await recordTelemetryEvent({
    eventName: "fact_check_started",
    category: "product",
    userId: user.id,
    requestId,
    context: { sessionId: sessionId || undefined, page: "/check" },
    metadata: { inputType: submission.inputType },
  });
  await recordTelemetryEvent({
    eventName: "input_validated",
    category: "product",
    userId: user.id,
    requestId,
    context: { sessionId: sessionId || undefined, page: "/check" },
    metadata: { inputType: submission.inputType },
  });
  await recordTelemetryEvent({
    eventName: submission.inputType === "text" ? "text_submitted" : submission.inputType === "link" ? "link_submitted" : "screenshot_uploaded",
    category: "product",
    userId: user.id,
    requestId,
    context: { sessionId: sessionId || undefined, page: "/check" },
  });
  const image = formData.get("image");
  let imageBytes: Buffer | undefined;
  if (submission.inputType === "screenshot") {
    if (!(image instanceof File) || image.size === 0) {
      return errorResponse("Choose a screenshot to analyze.", 400, "IMAGE_REQUIRED", requestId);
    }
    const planImageLimit = profile.plan === "free" && profile.role !== "admin" ? Math.min(maxImageBytes, 3 * 1024 * 1024) : maxImageBytes;
    if (!acceptedImageTypes.has(image.type) || image.size > planImageLimit) {
      return errorResponse(
        `Use a JPG, PNG, or WebP image no larger than ${Math.round(planImageLimit / 1024 / 1024)} MB.`,
        400,
        "INVALID_IMAGE",
        requestId,
      );
    }
    const uploadStartedAt = Date.now();
    imageBytes = Buffer.from(await image.arrayBuffer());
    await recordPerformanceMetric({ metricName: "upload_latency", value: Date.now() - uploadStartedAt, route: "/api/fact-check", userId: user.id, context: { sessionId: sessionId || undefined }, metadata: { bytes: image.size } });
    if (!hasValidImageSignature(image.type, imageBytes)) {
      return errorResponse("The uploaded file does not match its image type.", 400, "INVALID_IMAGE_SIGNATURE", requestId);
    }
  }

  const reservationStartedAt = Date.now();
  const { data: reservationData, error: reservationError } = await admin.rpc(
    "reserve_fact_check",
    { p_user_id: user.id, p_idempotency_key: submission.idempotencyKey },
  );
  await recordPerformanceMetric({ metricName: "database_latency", value: Date.now() - reservationStartedAt, route: "/api/fact-check", userId: user.id, context: { sessionId: sessionId || undefined }, metadata: { operation: "reserve_fact_check" } });
  if (reservationError) return errorResponse("Usage could not be verified.", 500, "USAGE_ERROR", requestId);

  const reservation = reservationData as Reservation;
  if (!reservation.allowed) {
    await recordTelemetryEvent({ eventName: "free_limit_reached", category: "product", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { inputType: submission.inputType, used: reservation.used || 0, limit: reservation.limit || 0 } });
    await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: 402, latencyMs: Date.now() - requestStartedAt, userId: user.id, requestId, sessionId, errorType: "api_error", errorCode: "LIMIT_REACHED" });
    return NextResponse.json(
      { error: "You have reached your plan limit.", code: "LIMIT_REACHED", ...reservation },
      { status: 402, headers: responseHeaders(requestId, { "X-RateLimit-Remaining": String(rateLimit.remaining) }) },
    );
  }
  if (reservation.status === "completed" && reservation.factCheckId) {
    return NextResponse.json({ factCheckId: reservation.factCheckId, reused: true }, {
      headers: responseHeaders(requestId, { "X-RateLimit-Remaining": String(rateLimit.remaining) }),
    });
  }
  if (reservation.status === "charged") {
    return NextResponse.json({
      error: "This AI attempt was already processed and counted toward your plan.",
      code: "ATTEMPT_ALREADY_CHARGED",
      charged: true,
    }, {
      status: 409,
      headers: responseHeaders(requestId, { "X-RateLimit-Remaining": String(rateLimit.remaining) }),
    });
  }
  if (!reservation.reservationId) {
    return errorResponse("A usage reservation could not be created.", 500, "USAGE_ERROR", requestId);
  }

  const factCheckLogId = await startFactCheckLog({
    userId: user.id,
    requestId,
    sessionId,
    inputType: submission.inputType,
    stage: "reserved",
    reservationId: reservation.reservationId,
  });

  const contentHash = normalizedContentHash(submission, imageBytes);
  const { data: cachedRow } = await admin
    .from("fact_check_cache")
    .select("result")
    .eq("content_hash", contentHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const cachedResult = factCheckResultSchema.safeParse(cachedRow?.result);
  if (cachedResult.success) {
    const completionStartedAt = Date.now();
    const { data: factCheckId, error: completionError } = await admin.rpc("complete_fact_check", {
      p_user_id: user.id,
      p_reservation_id: reservation.reservationId,
      p_input_type: submission.inputType,
      p_raw_text: submission.text,
      p_submitted_url: submission.url,
      p_screenshot_path: "",
      p_result: cachedResult.data,
    });
    if (completionError) return errorResponse("The cached result could not be saved.", 500, "CACHE_SAVE_FAILED", requestId);
    await Promise.all([
      admin.rpc("mark_fact_check_cache_hit", { p_content_hash: contentHash }),
      recordAiUsage({ factCheckLogId, userId: user.id, requestId, model: "cache", requestType: "fact_check", stage: "cache", status: "completed", metadata: { cacheHit: true, route: "cache", plan: profile.plan, inputType: submission.inputType } }),
      recordPerformanceMetric({ metricName: "database_latency", value: Date.now() - completionStartedAt, route: "/api/fact-check", userId: user.id, context: { sessionId: sessionId || undefined }, metadata: { operation: "complete_cached_fact_check" } }),
      completeFactCheckLog(factCheckLogId, { factCheckId: factCheckId as string, stage: "cache_hit", status: "completed", durationMs: Date.now() - requestStartedAt, category: cachedResult.data.category, verdict: cachedResult.data.verdict, truthScore: cachedResult.data.truthScore, confidenceScore: cachedResult.data.confidenceScore, metadata: { cacheHit: true, inputType: submission.inputType } }),
    ]);
    await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: 200, latencyMs: Date.now() - requestStartedAt, userId: user.id, requestId, sessionId, metadata: { inputType: submission.inputType, cacheHit: true } });
    return NextResponse.json({ factCheckId, reused: true, cached: true }, { headers: responseHeaders(requestId, { "X-RateLimit-Remaining": String(rateLimit.remaining), "X-Fact-Check-Cache": "hit" }) });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let streamOpen = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (content: string) => {
        if (!streamOpen) return;
        try {
          controller.enqueue(encoder.encode(content));
        } catch {
          streamOpen = false;
        }
      };

      send(": connected\n\n");
      heartbeat = setInterval(() => send(": heartbeat\n\n"), 10_000);

      void (async () => {
        let aiUsed = false;
        try {
          const useImageVision = submission.inputType === "screenshot" && analysisSubmission.text.length < 40;
          const imageDataUrl = useImageVision && image instanceof File && imageBytes
            ? `data:${image.type};base64,${imageBytes.toString("base64")}`
            : undefined;
          await recordTelemetryEvent({ eventName: "ai_request_started", category: "product", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { inputType: submission.inputType } });
          const result = await analyzeFactCheck(
            { ...analysisSubmission, imageDataUrl },
            { userId: user.id, requestId, factCheckLogId, plan: profile.plan, inputTruncated: reducedText.truncated, maxInputChars: inputLimit },
          );
          aiUsed = true;
          const completionStartedAt = Date.now();
          const { data: factCheckId, error: completionError } = await admin.rpc(
            "complete_fact_check",
            {
              p_user_id: user.id,
              p_reservation_id: reservation.reservationId,
              p_input_type: submission.inputType,
              p_raw_text: submission.text,
              p_submitted_url: submission.url,
              p_screenshot_path: "",
              p_result: result,
            },
          );
          await recordPerformanceMetric({ metricName: "database_latency", value: Date.now() - completionStartedAt, route: "/api/fact-check", userId: user.id, context: { sessionId: sessionId || undefined }, metadata: { operation: "complete_fact_check" } });
          if (completionError) throw new Error("The result could not be saved.");
          const ttlHours = cacheTtlHours(result.category, costConfig.cacheTtlHours);
          await admin.from("fact_check_cache").upsert({
            content_hash: contentHash,
            result,
            input_type: submission.inputType,
            category: result.category,
            source_fact_check_id: factCheckId,
            expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
            updated_at: new Date().toISOString(),
          });
          await completeFactCheckLog(factCheckLogId, {
            factCheckId: factCheckId as string,
            stage: "completed",
            status: "completed",
            durationMs: Date.now() - requestStartedAt,
            category: result.category,
            verdict: result.verdict,
            truthScore: result.truthScore,
            confidenceScore: result.confidenceScore,
            metadata: { inputType: submission.inputType, sourceCount: result.methodology?.sourceCount || 0, cacheHit: false, inputTruncated: reducedText.truncated },
          });
          await recordTelemetryEvent({ eventName: "result_generated", category: "product", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { inputType: submission.inputType, category: result.category, verdict: result.verdict } });
          await recordTelemetryEvent({ eventName: "fact_check_completed", category: "product", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { inputType: submission.inputType, category: result.category, verdict: result.verdict } });
          await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: 200, latencyMs: Date.now() - requestStartedAt, userId: user.id, requestId, sessionId, metadata: { inputType: submission.inputType } });
          send(`data: ${JSON.stringify({ factCheckId })}\n\n`);
        } catch (error) {
          const chargeAttempt = aiUsed || (error instanceof FactCheckAnalysisError && error.aiUsed);
          const accountingRpc = chargeAttempt ? "charge_fact_check_attempt" : "release_fact_check";
          const { error: accountingError } = await admin.rpc(accountingRpc, {
            p_user_id: user.id,
            p_reservation_id: reservation.reservationId,
          });
          if (accountingError) {
            logServerError("fact_check.usage_accounting_failed", {
              requestId,
              accountingRpc,
              errorName: accountingError.name,
            });
          }
          const errorCode = error instanceof ConfigurationError
            ? "NOT_CONFIGURED"
            : error instanceof FactCheckAnalysisError
              ? error.code
              : "ANALYSIS_FAILED";
          const stage = error instanceof FactCheckAnalysisError && !error.aiUsed ? "pre_ai" : "analysis";
          await completeFactCheckLog(factCheckLogId, {
            stage,
            status: "failed",
            durationMs: Date.now() - requestStartedAt,
            errorCode,
            errorReason: error instanceof Error ? error.message : "Unknown fact-check failure",
            metadata: { inputType: submission.inputType, charged: chargeAttempt },
          });
          await recordTelemetryEvent({ eventName: "fact_check_failed", category: "product", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { inputType: submission.inputType, stage, errorCode, charged: chargeAttempt } });
          await recordError({ error, type: error instanceof FactCheckAnalysisError ? "ai_error" : "api_error", severity: "error", endpoint: "/api/fact-check", userId: user.id, requestId, context: { sessionId: sessionId || undefined }, metadata: { stage, errorCode, charged: chargeAttempt } });
          await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: error instanceof ConfigurationError ? 503 : 500, latencyMs: Date.now() - requestStartedAt, userId: user.id, requestId, sessionId, errorType: error instanceof FactCheckAnalysisError ? "ai_error" : "api_error", errorCode, metadata: { stage, charged: chargeAttempt } });
          if (error instanceof ConfigurationError) {
            send(`data: ${JSON.stringify({ error: error.message, code: "NOT_CONFIGURED", requestId })}\n\n`);
          } else if (error instanceof FactCheckAnalysisError) {
            logServerError("fact_check.pipeline_failed", {
              requestId,
              aiUsed: error.aiUsed,
              errorName: error.name,
            });
            send(`data: ${JSON.stringify({
              error: error.message,
              code: error.code,
              charged: chargeAttempt,
              requestId,
            })}\n\n`);
          } else {
            logServerError("fact_check.pipeline_failed", { requestId, errorName: getErrorName(error) });
            send(`data: ${JSON.stringify({
              error: chargeAttempt
                ? "We could not save this check after AI analysis completed. This attempt counted toward your plan."
                : "We could not complete this check before AI analysis started. This attempt was not charged.",
              code: "ANALYSIS_FAILED",
              charged: chargeAttempt,
              requestId,
            })}\n\n`);
          }
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          if (streamOpen) {
            streamOpen = false;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      streamOpen = false;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: responseHeaders(requestId, {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    }),
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  try {
    return await handlePost(request, requestId);
  } catch (error) {
    logServerError("fact_check.request_failed", { requestId, errorName: getErrorName(error) });
    await recordError({ error, type: "api_error", severity: "critical", endpoint: "/api/fact-check", requestId });
    await recordApiRequest({ endpoint: "/api/fact-check", method: "POST", statusCode: 500, latencyMs: Date.now() - startedAt, requestId, errorType: "api_error", errorCode: "INTERNAL_ERROR" });
    return errorResponse(
      "The check service encountered an unexpected error. Your usage was not charged. Please try again.",
      500,
      "INTERNAL_ERROR",
      requestId,
    );
  }
}