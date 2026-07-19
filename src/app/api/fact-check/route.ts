import { NextResponse, type NextRequest } from "next/server";
import { ConfigurationError } from "@/lib/env";
import { analyzeFactCheck, FactCheckAnalysisError } from "@/lib/fact-check/provider";
import { factCheckSubmissionSchema } from "@/lib/fact-check/schema";
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
    return errorResponse(
      submissionResult.error.issues[0]?.message || "Check the submitted content.",
      400,
      "INVALID_INPUT",
      requestId,
    );
  }

  const submission = submissionResult.data;
  const image = formData.get("image");
  let imageBytes: Buffer | undefined;
  if (submission.inputType === "screenshot") {
    if (!(image instanceof File) || image.size === 0) {
      return errorResponse("Choose a screenshot to analyze.", 400, "IMAGE_REQUIRED", requestId);
    }
    if (!acceptedImageTypes.has(image.type) || image.size > maxImageBytes) {
      return errorResponse(
        "Use a JPG, PNG, or WebP image no larger than 5 MB.",
        400,
        "INVALID_IMAGE",
        requestId,
      );
    }
    imageBytes = Buffer.from(await image.arrayBuffer());
    if (!hasValidImageSignature(image.type, imageBytes)) {
      return errorResponse("The uploaded file does not match its image type.", 400, "INVALID_IMAGE_SIGNATURE", requestId);
    }
  }

  const { data: reservationData, error: reservationError } = await admin.rpc(
    "reserve_fact_check",
    { p_user_id: user.id, p_idempotency_key: submission.idempotencyKey },
  );
  if (reservationError) return errorResponse("Usage could not be verified.", 500, "USAGE_ERROR", requestId);

  const reservation = reservationData as Reservation;
  if (!reservation.allowed) {
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
          const imageDataUrl = image instanceof File && imageBytes && submission.inputType === "screenshot"
            ? `data:${image.type};base64,${imageBytes.toString("base64")}`
            : undefined;
          const result = await analyzeFactCheck({ ...submission, imageDataUrl });
          aiUsed = true;
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
          if (completionError) throw new Error("The result could not be saved.");
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
  const requestId = getRequestId(request);
  try {
    return await handlePost(request, requestId);
  } catch (error) {
    logServerError("fact_check.request_failed", { requestId, errorName: getErrorName(error) });
    return errorResponse(
      "The check service encountered an unexpected error. Your usage was not charged. Please try again.",
      500,
      "INTERNAL_ERROR",
      requestId,
    );
  }
}