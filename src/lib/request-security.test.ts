import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRequestId,
  hasValidImageSignature,
  isRequestBodyTooLarge,
  isSameOriginRequest,
} from "./request-security";

describe("request security", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example");
  });

  it("accepts only the configured browser origin", () => {
    expect(isSameOriginRequest(new Request("https://insight.example/api", { headers: { origin: "https://insight.example" } }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://insight.example/api", { headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://insight.example/api"))).toBe(false);
  });

  it("accepts the actual app origin when local development uses another port", () => {
    expect(
      isSameOriginRequest(new Request("http://localhost:3001/api/fact-check", {
        method: "POST",
        headers: { origin: "http://localhost:3001" },
      })),
    ).toBe(true);
    expect(
      isSameOriginRequest(new Request("http://localhost:3001/api/fact-check", {
        method: "POST",
        headers: { origin: "http://localhost:3002" },
      })),
    ).toBe(false);
  });

  it("rejects oversized or invalid declared body lengths", () => {
    expect(isRequestBodyTooLarge(new Request("https://insight.example", { headers: { "content-length": "101" } }), 100)).toBe(true);
    expect(isRequestBodyTooLarge(new Request("https://insight.example", { headers: { "content-length": "100" } }), 100)).toBe(false);
    expect(isRequestBodyTooLarge(new Request("https://insight.example", { headers: { "content-length": "invalid" } }), 100)).toBe(true);
  });

  it("preserves safe request IDs and replaces unsafe values", () => {
    expect(getRequestId(new Request("https://insight.example", { headers: { "x-request-id": "request_12345678" } }))).toBe("request_12345678");
    expect(getRequestId(new Request("https://insight.example", { headers: { "x-request-id": "short" } }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("image signatures", () => {
  it("recognizes supported image magic bytes", () => {
    expect(hasValidImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(hasValidImageSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasValidImageSignature("image/webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(true);
  });

  it("rejects spoofed MIME types", () => {
    expect(hasValidImageSignature("image/png", Uint8Array.from([0x3c, 0x73, 0x76, 0x67]))).toBe(false);
    expect(hasValidImageSignature("image/gif", Uint8Array.from([0x47, 0x49, 0x46]))).toBe(false);
  });
});