import { NextResponse, type NextRequest } from "next/server";
import { ConfigurationError } from "@/lib/env";
import { analyzeFactCheck } from "@/lib/fact-check/provider";
import { factCheckSubmissionSchema } from "@/lib/fact-check/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function errorResponse(message: string, status: number, code: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message, code }, { status, headers });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return errorResponse("Authentication is not configured.", 503, "NOT_CONFIGURED");

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return errorResponse("Sign in to run a fact check.", 401, "UNAUTHORIZED");

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(error.message, 503, "NOT_CONFIGURED");
    throw error;
  }

  const rateLimit = checkRateLimit(user.id);
  if (!rateLimit.allowed) {
    return errorResponse("Too many requests. Try again shortly.", 429, "RATE_LIMITED", {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("The submission could not be read.", 400, "INVALID_FORM");
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
    );
  }

  const submission = submissionResult.data;
  const image = formData.get("image");
  if (submission.inputType === "screenshot") {
    if (!(image instanceof File) || image.size === 0) {
      return errorResponse("Choose a screenshot to analyze.", 400, "IMAGE_REQUIRED");
    }
    if (!acceptedImageTypes.has(image.type) || image.size > maxImageBytes) {
      return errorResponse(
        "Use a JPG, PNG, or WebP image no larger than 5 MB.",
        400,
        "INVALID_IMAGE",
      );
    }
  }

  const { data: reservationData, error: reservationError } = await admin.rpc(
    "reserve_fact_check",
    { p_user_id: user.id, p_idempotency_key: submission.idempotencyKey },
  );
  if (reservationError) return errorResponse("Usage could not be verified.", 500, "USAGE_ERROR");

  const reservation = reservationData as Reservation;
  if (!reservation.allowed) {
    return NextResponse.json(
      { error: "You have reached your plan limit.", code: "LIMIT_REACHED", ...reservation },
      { status: 402 },
    );
  }
  if (reservation.status === "completed" && reservation.factCheckId) {
    return NextResponse.json({ factCheckId: reservation.factCheckId, reused: true });
  }
  if (!reservation.reservationId) {
    return errorResponse("A usage reservation could not be created.", 500, "USAGE_ERROR");
  }

  let screenshotPath = "";
  try {
    let imageDataUrl: string | undefined;
    if (image instanceof File && submission.inputType === "screenshot") {
      const bytes = Buffer.from(await image.arrayBuffer());
      const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
      screenshotPath = `${user.id}/${submission.idempotencyKey}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("screenshots")
        .upload(screenshotPath, bytes, { contentType: image.type, upsert: false });
      if (uploadError) throw new Error("The screenshot could not be stored.");
      imageDataUrl = `data:${image.type};base64,${bytes.toString("base64")}`;
    }

    const result = await analyzeFactCheck({ ...submission, imageDataUrl });
    const { data: factCheckId, error: completionError } = await admin.rpc(
      "complete_fact_check",
      {
        p_user_id: user.id,
        p_reservation_id: reservation.reservationId,
        p_input_type: submission.inputType,
        p_raw_text: submission.text,
        p_submitted_url: submission.url,
        p_screenshot_path: screenshotPath,
        p_result: result,
      },
    );
    if (completionError) throw new Error("The result could not be saved.");

    return NextResponse.json({ factCheckId, result }, { status: 201 });
  } catch (error) {
    await admin.rpc("release_fact_check", { p_user_id: user.id, p_reservation_id: reservation.reservationId });
    if (screenshotPath) await supabase.storage.from("screenshots").remove([screenshotPath]);

    if (error instanceof ConfigurationError) {
      return errorResponse(error.message, 503, "NOT_CONFIGURED");
    }
    console.error("Fact-check pipeline failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse(
      "We could not complete this check. Your usage was not charged. Please try again.",
      502,
      "ANALYSIS_FAILED",
    );
  }
}