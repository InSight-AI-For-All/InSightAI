import { beforeEach, describe, expect, it } from "vitest";
import { getPlan } from "./plans";
import { checkRateLimit, clearRateLimits } from "./rate-limit";

describe("plan limits", () => {
  it("defaults unknown plans to the five-check Free tier", () => {
    expect(getPlan("unexpected")).toMatchObject({ id: "free", limit: 5 });
  });

  it("sets Starter to 1,000 checks per month", () => {
    expect(getPlan("starter")).toMatchObject({
      id: "starter",
      limit: 1_000,
      cadence: "month",
    });
  });
});

describe("rate limiting", () => {
  beforeEach(clearRateLimits);

  it("allows ten requests and blocks the eleventh in a window", () => {
    const now = 1_000_000;
    for (let request = 0; request < 10; request += 1) {
      expect(checkRateLimit("user-1", now).allowed).toBe(true);
    }

    expect(checkRateLimit("user-1", now)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("starts a fresh bucket after the window expires", () => {
    checkRateLimit("user-1", 1_000_000);
    expect(checkRateLimit("user-1", 1_060_000)).toMatchObject({
      allowed: true,
      remaining: 9,
    });
  });
});