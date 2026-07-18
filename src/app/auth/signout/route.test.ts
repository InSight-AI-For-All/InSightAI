import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("sign-out request boundary", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example"));

  it("rejects cross-origin sign-out attempts", async () => {
    const response = await POST(new NextRequest("https://insight.example/auth/signout", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
  });
});