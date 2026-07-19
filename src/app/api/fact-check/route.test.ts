import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
}));

describe("fact-check request boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example");
    getUser.mockReset();
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
});