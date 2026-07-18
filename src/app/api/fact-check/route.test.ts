import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("fact-check request boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example");
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
});