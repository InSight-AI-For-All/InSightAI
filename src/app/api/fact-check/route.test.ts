import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { analyzeFactCheck, getUser, rpc } = vi.hoisted(() => ({
  analyzeFactCheck: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ rpc })),
}));

vi.mock("@/lib/fact-check/provider", () => ({ analyzeFactCheck }));

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
});