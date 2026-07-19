import { describe, expect, it } from "vitest";
import { getLoginDestination, getSafeRedirectDestination, isProtectedAppPath } from "@/lib/auth-redirect";

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

describe("protected auth redirects", () => {
  it.each(["/dashboard", "/check", "/history", "/results/id", "/account", "/admin/overview"])("protects %s", (path) => {
    expect(isProtectedAppPath(path)).toBe(true);
  });

  it("returns users to the exact protected action after authentication", () => {
    const destination = getLoginDestination(new URL("https://insight.example/check?mode=link"));
    expect(destination.href).toBe("https://insight.example/login?next=%2Fcheck%3Fmode%3Dlink");
  });
});