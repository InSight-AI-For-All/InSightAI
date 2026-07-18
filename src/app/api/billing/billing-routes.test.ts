import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";

describe("billing request boundary", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example"));

  it.each([
    ["checkout", checkout],
    ["portal", portal],
  ])("rejects cross-origin %s requests", async (_name, handler) => {
    const response = await handler(new NextRequest("https://insight.example/api/billing", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_ORIGIN" });
  });
});