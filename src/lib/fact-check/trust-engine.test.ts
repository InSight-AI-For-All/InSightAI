import { describe, expect, it } from "vitest";
import type { FactCheckClassification, FactCheckResearch } from "./schema";
import { buildNonFactualResult, buildTrustedFactCheck, rankSource, verdictFromScore } from "./trust-engine";

const classification: FactCheckClassification = {
  category: "Science",
  claimType: "Factual Claim",
  factCheckable: true,
  confidenceScore: 92,
  summary: "The claim can be checked against published evidence.",
  explanation: "This is a measurable factual statement.",
  claims: [{ text: "The measured value increased.", claimType: "Factual Claim", factCheckable: true }],
};

function research(overrides: Partial<FactCheckResearch> = {}): FactCheckResearch {
  return {
    category: "Science",
    claimType: "Factual Claim",
    factCheckable: true,
    summary: "Available evidence supports the claim.",
    claims: [{
      text: "The measured value increased.",
      claimType: "Factual Claim",
      factCheckable: true,
      reasoning: "Two independent sources report the increase.",
      evidence: [
        { sourceUrl: "https://cdc.gov/report", stance: "supports", evidenceSummary: "The official report records an increase." },
        { sourceUrl: "https://reuters.com/report", stance: "supports", evidenceSummary: "Independent reporting confirms the increase." },
      ],
    }],
    analysis: "The sources agree on the measured direction.",
    evidenceAssessment: "One primary and one established independent source support the claim.",
    limitations: "The underlying raw data was not independently recalculated.",
    uncertainties: "Later revisions could change the reported value.",
    recommendedAction: "Review the official dataset before making a consequential decision.",
    disclaimer: "This is AI-generated, evidence-assisted analysis that may be wrong and is not final authority.",
    ...overrides,
  };
}

describe("source reliability", () => {
  it("ranks authoritative, established, and other domains deterministically", () => {
    expect(rankSource("https://cdc.gov/report").tier).toBe(1);
    expect(rankSource("https://reuters.com/report").tier).toBe(2);
    expect(rankSource("https://example.com/post").tier).toBe(3);
  });

  it("maps score bands to verdicts", () => {
    expect(verdictFromScore(20)).toBe("False");
    expect(verdictFromScore(40)).toBe("Mostly False");
    expect(verdictFromScore(60)).toBe("Mixed");
    expect(verdictFromScore(80)).toBe("Mostly True");
    expect(verdictFromScore(81)).toBe("True");
  });
});

describe("trust guardrails", () => {
  it("does not assign truth scores to opinions", () => {
    const result = buildNonFactualResult({
      ...classification,
      category: "Opinion",
      claimType: "Opinion / Subjective",
      factCheckable: false,
      claims: [{ text: "This movie is terrible.", claimType: "Opinion / Subjective", factCheckable: false }],
    });
    expect(result.verdict).toBe("Opinion / Not Fact Checkable");
    expect(result.truthScore).toBeNull();
    expect(result.methodology.searchPerformed).toBe(false);
  });

  it("fails closed when fewer than two independent sources verify a factual claim", () => {
    const limited = research({
      claims: [{
        text: "The measured value increased.",
        claimType: "Factual Claim",
        factCheckable: true,
        reasoning: "Only one source was found.",
        evidence: [{ sourceUrl: "https://cdc.gov/report", stance: "supports", evidenceSummary: "The report records an increase." }],
      }],
    });
    const result = buildTrustedFactCheck(classification, limited, [{ title: "Official report", url: "https://cdc.gov/report" }]);
    expect(result.verdict).toBe("Unverifiable");
    expect(result.truthScore).toBeNull();
    expect(result.confidenceScore).toBeLessThanOrEqual(35);
  });

  it("weights stronger corroborating evidence and records methodology", () => {
    const result = buildTrustedFactCheck(classification, research(), [
      { title: "Official report", url: "https://cdc.gov/report" },
      { title: "Independent report", url: "https://reuters.com/report" },
    ]);
    expect(result.truthScore).toBe(100);
    expect(result.verdict).toBe("True");
    expect(result.sources.map((source) => source.tier)).toEqual([1, 2]);
    expect(result.methodology.independentSourceCount).toBe(2);
    expect(result.methodology.evidenceQuality).toBe("Moderate");
  });

  it("turns conflicting weighted evidence into a mixed claim", () => {
    const conflicting = research({
      claims: [{
        text: "The measured value increased.",
        claimType: "Factual Claim",
        factCheckable: true,
        reasoning: "The primary and secondary sources disagree.",
        evidence: [
          { sourceUrl: "https://cdc.gov/report", stance: "supports", evidenceSummary: "The official report records an increase." },
          { sourceUrl: "https://reuters.com/report", stance: "contradicts", evidenceSummary: "Independent reporting disputes the increase." },
        ],
      }],
    });
    const result = buildTrustedFactCheck(classification, conflicting, [
      { title: "Official report", url: "https://cdc.gov/report" },
      { title: "Independent report", url: "https://reuters.com/report" },
    ]);
    expect(result.truthScore).toBe(60);
    expect(result.verdict).toBe("Mixed");
  });

  it("caps confidence for high-risk claims without primary evidence", () => {
    const healthClassification: FactCheckClassification = {
      ...classification,
      category: "Health",
      claims: [{ text: "A treatment prevents disease.", claimType: "Factual Claim", factCheckable: true }],
    };
    const mediaOnly = research({
      category: "Health",
      claims: [{
        text: "A treatment prevents disease.",
        claimType: "Factual Claim",
        factCheckable: true,
        reasoning: "Two established reports agree but no primary study was available.",
        evidence: [
          { sourceUrl: "https://reuters.com/health", stance: "supports", evidenceSummary: "Reuters reports the claim." },
          { sourceUrl: "https://apnews.com/health", stance: "supports", evidenceSummary: "AP reports the claim." },
        ],
      }],
    });
    const result = buildTrustedFactCheck(healthClassification, mediaOnly, [
      { title: "Reuters report", url: "https://reuters.com/health" },
      { title: "AP report", url: "https://apnews.com/health" },
    ]);
    expect(result.truthScore).toBe(100);
    expect(result.confidenceScore).toBeLessThanOrEqual(55);
  });

  it("ignores model-provided URLs that were not returned by web search", () => {
    const result = buildTrustedFactCheck(classification, research(), [
      { title: "Official report", url: "https://cdc.gov/report" },
    ]);
    expect(result.sources).toHaveLength(1);
    expect(result.truthScore).toBeNull();
  });

  it("keeps classified claims that the research stage omits and withholds the overall score", () => {
    const compoundClassification: FactCheckClassification = {
      ...classification,
      claims: [
        classification.claims[0],
        { text: "A second measure doubled.", claimType: "Factual Claim", factCheckable: true },
      ],
    };
    const result = buildTrustedFactCheck(compoundClassification, research(), [
      { title: "Official report", url: "https://cdc.gov/report" },
      { title: "Independent report", url: "https://reuters.com/report" },
    ]);
    expect(result.claims).toHaveLength(2);
    expect(result.claims[1].verdict).toBe("Unverifiable");
    expect(result.claims[1].truthScore).toBeNull();
    expect(result.truthScore).toBeNull();
  });

  it("matches reordered research claims by text instead of array position", () => {
    const compoundClassification: FactCheckClassification = {
      ...classification,
      claims: [
        classification.claims[0],
        { text: "A second measure doubled.", claimType: "Factual Claim", factCheckable: true },
      ],
    };
    const baseResearch = research();
    const reordered: FactCheckResearch = {
      ...baseResearch,
      claims: [
        {
          text: "A second measure doubled.",
          claimType: "Factual Claim",
          factCheckable: true,
          reasoning: "No evidence was found for the second measure.",
          evidence: [],
        },
        baseResearch.claims[0],
      ],
    };
    const result = buildTrustedFactCheck(compoundClassification, reordered, [
      { title: "Official report", url: "https://cdc.gov/report" },
      { title: "Independent report", url: "https://reuters.com/report" },
    ]);
    expect(result.claims[0].truthScore).toBe(100);
    expect(result.claims[1].truthScore).toBeNull();
  });
});