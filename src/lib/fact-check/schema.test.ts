import { describe, expect, it } from "vitest";
import {
  factCheckClassificationSchema,
  factCheckResearchSchema,
  factCheckResultSchema,
  factCheckSubmissionSchema,
} from "./schema";

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
  limitations: "Some relevant pages may not be publicly accessible.",
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
    const parsed = factCheckResultSchema.safeParse(validResult);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sources).toEqual([]);
  });

  it("rejects unsupported verdicts and scores outside 0 to 100", () => {
    expect(
      factCheckResultSchema.safeParse({ ...validResult, verdict: "Definitely true" }).success,
    ).toBe(false);
    expect(factCheckResultSchema.safeParse({ ...validResult, truthScore: 101 }).success).toBe(
      false,
    );
  });

  it("accepts cited web sources and rejects non-web URLs", () => {
    expect(
      factCheckResultSchema.safeParse({
        ...validResult,
        sources: [{ title: "Primary source", url: "https://example.com/report" }],
      }).success,
    ).toBe(true);
    expect(
      factCheckResultSchema.safeParse({
        ...validResult,
        sources: [{ title: "Unsafe source", url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
  });

  it("allows an explicit unscored non-factual result", () => {
    const parsed = factCheckResultSchema.safeParse({
      ...validResult,
      verdict: "Opinion / Not Fact Checkable",
      truthScore: null,
      category: "Opinion",
      claimType: "Opinion / Subjective",
      factCheckable: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.truthScore).toBeNull();
  });
});

describe("fact-check pipeline stages", () => {
  it("validates claim decomposition before research", () => {
    expect(
      factCheckClassificationSchema.safeParse({
        category: "Finance",
        claimType: "Factual Claim",
        factCheckable: true,
        confidenceScore: 91,
        summary: "The post contains two measurable claims.",
        explanation: "Tax and unemployment changes can be checked independently.",
        claims: [
          { text: "Taxes increased by 50%.", claimType: "Factual Claim", factCheckable: true },
          { text: "Unemployment doubled.", claimType: "Factual Claim", factCheckable: true },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires researched evidence to use valid web URLs", () => {
    const research = {
      category: "Science",
      claimType: "Factual Claim",
      factCheckable: true,
      summary: "Evidence was reviewed.",
      claims: [{
        text: "The measured value increased.",
        claimType: "Factual Claim",
        factCheckable: true,
        reasoning: "The reports agree.",
        evidence: [{ sourceUrl: "javascript:alert(1)", stance: "supports", evidenceSummary: "Unsafe URL." }],
      }],
      analysis: "Analysis.",
      evidenceAssessment: "Assessment.",
      limitations: "Limitations.",
      uncertainties: "Uncertainties.",
      recommendedAction: "Check the source.",
      disclaimer: "AI-generated and not final authority.",
    };
    expect(factCheckResearchSchema.safeParse(research).success).toBe(false);
  });
});