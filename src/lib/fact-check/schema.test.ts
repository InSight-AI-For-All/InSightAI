import { describe, expect, it } from "vitest";
import { factCheckResultSchema, factCheckSubmissionSchema } from "./schema";

const validResult = {
  verdict: "Mixed",
  truthScore: 62,
  confidenceScore: 74,
  category: "Science",
  claimType: "Factual Claim",
  summary: "The claim leaves out important context.",
  keyClaims: ["A measurable event happened."],
  analysis: "Some of the claim is supported, but its comparison is incomplete.",
  evidenceAssessment: "The provided context supports only part of the statement.",
  limitations: "No live sources were retrieved.",
  recommendedAction: "Check the original study before sharing.",
  disclaimer: "This is AI-generated, evidence-assisted analysis, not final authority.",
} as const;

describe("factCheckSubmissionSchema", () => {
  it("accepts a factual text submission", () => {
    expect(
      factCheckSubmissionSchema.safeParse({
        inputType: "text",
        text: "The city council approved the measure yesterday.",
        url: "",
        idempotencyKey: "2c1dc1b2-6e08-4d09-a4c5-763686b55ca6",
      }).success,
    ).toBe(true);
  });

  it("rejects short text and non-http link protocols", () => {
    const base = { idempotencyKey: "2c1dc1b2-6e08-4d09-a4c5-763686b55ca6" };

    expect(
      factCheckSubmissionSchema.safeParse({ inputType: "text", text: "no", url: "", ...base })
        .success,
    ).toBe(false);
    expect(
      factCheckSubmissionSchema.safeParse({
        inputType: "link",
        text: "",
        url: "javascript:alert(1)",
        ...base,
      }).success,
    ).toBe(false);
  });
});

describe("factCheckResultSchema", () => {
  it("accepts a complete structured result", () => {
    expect(factCheckResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("rejects unsupported verdicts and scores outside 0 to 100", () => {
    expect(
      factCheckResultSchema.safeParse({ ...validResult, verdict: "Definitely true" }).success,
    ).toBe(false);
    expect(factCheckResultSchema.safeParse({ ...validResult, truthScore: 101 }).success).toBe(
      false,
    );
  });
});