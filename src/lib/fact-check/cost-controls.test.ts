import { describe, expect, it } from "vitest";
import { extractCandidateText, inputLimitForPlan, normalizedContentHash } from "./cost-controls";
import { getFactCheckConfig, modelPricing, selectResearchRoute } from "./config";

function environment(overrides: Record<string, string> = {}) {
  return {
    OPENAI_MODEL: "gpt-5-nano",
    OPENAI_DEFAULT_FACT_CHECK_MODEL: "",
    OPENAI_CHEAP_CLASSIFIER_MODEL: "",
    OPENAI_WEB_SEARCH_MODEL: "",
    OPENAI_HIGH_RISK_MODEL: "",
    ENABLE_WEB_SEARCH: "",
    ENABLE_MODEL_ROUTING: "",
    MAX_FACT_CHECK_INPUT_CHARS: "",
    MAX_FACT_CHECK_OUTPUT_TOKENS: "",
    FACT_CHECK_CACHE_TTL_HOURS: "",
    ...overrides,
  } as never;
}

describe("fact-check cost controls", () => {
  it("routes cheap classification, normal search, and high-risk search models", () => {
    const config = getFactCheckConfig(environment());
    expect(config.classifierModel).toBe("gpt-5-nano");
    expect(selectResearchRoute({ category: "General", factualClaimCount: 1 }, config)).toMatchObject({ model: "gpt-5.4-nano", route: "default", maxSearchCalls: 2 });
    expect(selectResearchRoute({ category: "Health", factualClaimCount: 1 }, config)).toMatchObject({ model: "gpt-5.4-mini", route: "high_risk", maxSearchCalls: 3 });
  });

  it("applies stricter free-user input limits", () => {
    expect(inputLimitForPlan("free", 8_000)).toBe(4_000);
    expect(inputLimitForPlan("pro", 8_000)).toBe(8_000);
  });

  it("reduces long input to factual-looking sentences", () => {
    const long = `${"I love this. ".repeat(500)}A study found 42 percent improvement. Another report says sales increased.`;
    const result = extractCandidateText(long, 500);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(600);
    expect(result.text).toContain("42 percent");
  });

  it("normalizes tracking URLs and equivalent text into stable hashes", () => {
    const first = normalizedContentHash({ inputType: "link", text: "", url: "https://example.com/a?utm_source=x", idempotencyKey: crypto.randomUUID() });
    const second = normalizedContentHash({ inputType: "link", text: "", url: "https://example.com/a", idempotencyKey: crypto.randomUUID() });
    expect(first).toBe(second);
  });

  it("uses the official current model price table", () => {
    expect(modelPricing("gpt-5-nano")).toEqual({ input: 0.05, cachedInput: 0.005, output: 0.4 });
    expect(modelPricing("gpt-5.4-nano")).toEqual({ input: 0.2, cachedInput: 0.02, output: 1.25 });
  });
});