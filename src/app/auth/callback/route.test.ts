import { describe, expect, it } from "vitest";
import { getSafeRedirectDestination } from "@/lib/auth-redirect";

const appUrl = "https://insight.example";

describe("getSafeRedirectDestination", () => {
  it("keeps same-origin paths and query parameters", () => {
    expect(getSafeRedirectDestination("/history?category=news", appUrl).href).toBe(
      "https://insight.example/history?category=news",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "dashboard",
  ])("falls back to the dashboard for unsafe destination %s", (requestedPath) => {
    expect(getSafeRedirectDestination(requestedPath, appUrl).href).toBe(
      "https://insight.example/dashboard",
    );
  });
});