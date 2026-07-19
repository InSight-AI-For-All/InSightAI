import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { analyzeFactCheck, FactCheckAnalysisError, getUser, rpc } = vi.hoisted(() => ({
  analyzeFactCheck: vi.fn(),
  FactCheckAnalysisError: class FactCheckAnalysisError extends Error {
    constructor(
      message: string,
      public readonly aiUsed: boolean,
      public readonly code: "LINK_CONTENT_UNAVAILABLE" | "ANALYSIS_FAILED",
    ) {
      super(message);
      this.name = "FactCheckAnalysisError";
    }
  },
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ rpc })),
}));

vi.mock("@/lib/fact-check/provider", () => ({ analyzeFactCheck, FactCheckAnalysisError }));

function authenticatedLinkRequest(idempotencyKey: string) {
  const formData = new FormData();
  formData.set("inputType", "link");
  formData.set("text", "");
  formData.set("url", "https://example.com/article");
  formData.set("idempotencyKey", idempotencyKey);
  return new NextRequest("https://insight.example/api/fact-check", {
    method: "POST",
    headers: { origin: "https://insight.example" },
    body: formData,
  });
}

function mockReservedUsage() {
  getUser.mockResolvedValueOnce({ data: { user: { id: "user-123" } } });
  rpc.mockImplementation(async (name: string) => {
    if (name === "check_fact_check_rate_limit") {
      return { data: { allowed: true, remaining: 9, retryAfterSeconds: 0 }, error: null };
    }
    if (name === "reserve_fact_check") {
      return { data: { allowed: true, status: "reserved", reservationId: "reservation-123" }, error: null };
    }
    return { data: null, error: null };
  });
}

describe("fact-check request boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example");
    analyzeFactCheck.mockReset();
    getUser.mockReset();
    rpc.mockReset();
  });

  it("rejects cross-origin submissions before authentication", async () => {
    const response = await POST(new NextRequest("https://insight.example/api/fact-check", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_ORIGIN" });
  });

  it("rejects oversized submissions before parsing multipart data", async () => {
    const response = await POST(new NextRequest("https://insight.example/api/fact-check", {
      method: "POST",
      headers: {
        origin: "https://insight.example",
        "content-length": String(7 * 1024 * 1024),
      },
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("blocks unauthenticated users from fact checking", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const response = await POST(new NextRequest("https://insight.example/api/fact-check", {
      method: "POST",
      headers: { origin: "https://insight.example" },
    }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns JSON when an unexpected authentication error escapes", async () => {
    getUser.mockRejectedValueOnce(new Error("Authentication provider unavailable"));
    const response = await POST(new NextRequest("https://insight.example/api/fact-check", {
      method: "POST",
      headers: { origin: "https://insight.example" },
    }));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      code: "INTERNAL_ERROR",
      error: "The check service encountered an unexpected error. Your usage was not charged. Please try again.",
    });
  });

  it("streams heartbeats and the completed fact-check identifier", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-123" } } });
    analyzeFactCheck.mockResolvedValueOnce({ verdict: "Unverifiable" });
    rpc.mockImplementation(async (name: string) => {
      if (name === "check_fact_check_rate_limit") {
        return { data: { allowed: true, remaining: 9, retryAfterSeconds: 0 }, error: null };
      }
      if (name === "reserve_fact_check") {
        return { data: { allowed: true, status: "reserved", reservationId: "reservation-123" }, error: null };
      }
      if (name === "complete_fact_check") return { data: "fact-check-123", error: null };
      return { data: null, error: null };
    });
    const formData = new FormData();
    formData.set("inputType", "link");
    formData.set("text", "A claim with enough context to research.");
    formData.set("url", "https://example.com/article");
    formData.set("idempotencyKey", "00000000-0000-4000-8000-000000000000");

    const response = await POST(new NextRequest("https://insight.example/api/fact-check", {
      method: "POST",
      headers: { origin: "https://insight.example" },
      body: formData,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    await expect(response.text()).resolves.toContain('data: {"factCheckId":"fact-check-123"}');
    expect(rpc).toHaveBeenCalledWith("complete_fact_check", expect.objectContaining({
      p_reservation_id: "reservation-123",
      p_user_id: "user-123",
    }));
  });

  it("releases a pre-AI extraction failure without charging", async () => {
    mockReservedUsage();
    analyzeFactCheck.mockRejectedValueOnce(new FactCheckAnalysisError(
      "The linked page could not be read. This attempt was not charged.",
      false,
      "LINK_CONTENT_UNAVAILABLE",
    ));

    const response = await POST(authenticatedLinkRequest("00000000-0000-4000-8000-000000000010"));
    await expect(response.text()).resolves.toContain('"charged":false');
    expect(rpc).toHaveBeenCalledWith("release_fact_check", {
      p_user_id: "user-123",
      p_reservation_id: "reservation-123",
    });
    expect(rpc).not.toHaveBeenCalledWith("charge_fact_check_attempt", expect.anything());
  });

  it("charges a failed attempt after OpenAI was called", async () => {
    mockReservedUsage();
    analyzeFactCheck.mockRejectedValueOnce(new FactCheckAnalysisError(
      "AI analysis started, so this attempt counted toward your plan.",
      true,
      "ANALYSIS_FAILED",
    ));

    const response = await POST(authenticatedLinkRequest("00000000-0000-4000-8000-000000000011"));
    await expect(response.text()).resolves.toContain('"charged":true');
    expect(rpc).toHaveBeenCalledWith("charge_fact_check_attempt", {
      p_user_id: "user-123",
      p_reservation_id: "reservation-123",
    });
    expect(rpc).not.toHaveBeenCalledWith("release_fact_check", expect.anything());
  });
});