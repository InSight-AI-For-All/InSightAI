import { describe, expect, it } from "vitest";
import { sanitizeMetadata } from "./server";

describe("telemetry metadata sanitizer", () => {
  it("drops sensitive keys and redacts known secret values", () => {
    const sanitized = sanitizeMetadata({
      stage: "research",
      prompt: "raw user claim",
      authorization: "Bearer secret-value",
      note: "provider returned sk-proj-abcdefghijklmnop",
      nested: { email: "private@example.com" },
    });

    expect(sanitized).toEqual({ stage: "research", note: "provider returned [REDACTED]" });
  });

  it("bounds keys, arrays, strings, and metadata entry count", () => {
    const sanitized = sanitizeMetadata(Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`field_${index}`, "x".repeat(600)])));
    expect(Object.keys(sanitized)).toHaveLength(40);
    expect(String(sanitized.field_0)).toHaveLength(500);
    expect(sanitizeMetadata({ values: Array.from({ length: 30 }, (_, index) => index) }).values).toHaveLength(20);
  });
});