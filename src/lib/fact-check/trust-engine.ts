import {
  sourceTierLabels,
  type FactCheckClassification,
  type FactCheckResearch,
  type FactCheckResult,
  type FactCheckSource,
} from "@/lib/fact-check/schema";

export type RetrievedSource = { title: string; url: string };

const tier1Domains = [
  "cdc.gov",
  "congress.gov",
  "doi.org",
  "europa.eu",
  "fda.gov",
  "imf.org",
  "jamanetwork.com",
  "nature.com",
  "nejm.org",
  "nih.gov",
  "oecd.org",
  "pubmed.ncbi.nlm.nih.gov",
  "science.org",
  "thelancet.com",
  "un.org",
  "who.int",
  "worldbank.org",
];

const tier2Domains = [
  "apnews.com",
  "bbc.com",
  "bloomberg.com",
  "factcheck.org",
  "ft.com",
  "npr.org",
  "nytimes.com",
  "politifact.com",
  "reuters.com",
  "snopes.com",
  "washingtonpost.com",
  "wsj.com",
];

const highRiskCategories = new Set<FactCheckResult["category"]>([
  "Politics",
  "Elections",
  "Health",
  "Finance",
  "Legal",
  "Breaking News",
  "Conflict / War",
]);

function matchesDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}

export function sourcePublisherKey(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const labels = hostname.split(".");
  if (labels.length <= 2) return hostname;
  const secondLevelSuffixes = new Set(["co.uk", "gov.uk", "com.au", "gov.au", "co.nz"]);
  const lastTwo = labels.slice(-2).join(".");
  return secondLevelSuffixes.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

export function rankSource(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const governmentOrAcademic = /\.(gov|mil|edu)$/.test(hostname) || /\.(gov|ac)\.[a-z]{2}$/.test(hostname);
  if (governmentOrAcademic || tier1Domains.some((domain) => matchesDomain(hostname, domain))) {
    return { tier: 1 as const, tierLabel: sourceTierLabels[0] };
  }
  if (tier2Domains.some((domain) => matchesDomain(hostname, domain))) {
    return { tier: 2 as const, tierLabel: sourceTierLabels[1] };
  }
  return { tier: 3 as const, tierLabel: sourceTierLabels[2] };
}

export function verdictFromScore(score: number): FactCheckResult["verdict"] {
  if (score <= 20) return "False";
  if (score <= 40) return "Mostly False";
  if (score <= 60) return "Mixed";
  if (score <= 80) return "Mostly True";
  return "True";
}

function nonFactualVerdict(claimType: FactCheckResult["claimType"]): FactCheckResult["verdict"] {
  if (claimType === "Prediction / Speculation") return "Prediction / Not Yet Verifiable";
  if (claimType === "Satire / Meme" || claimType === "Joke / Humor") return "Satire / Meme";
  if (claimType === "Unverifiable") return "Unverifiable";
  return "Opinion / Not Fact Checkable";
}

function normalizedClaimText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

function evidenceQuality(sources: FactCheckSource[], independentSourceCount: number) {
  const tier1 = sources.filter((source) => source.tier === 1).length;
  const tier2 = sources.filter((source) => source.tier === 2).length;
  if (independentSourceCount >= 3 && tier1 >= 1) return "Strong" as const;
  if (independentSourceCount >= 2 && (tier1 >= 1 || tier2 >= 2)) return "Moderate" as const;
  if (independentSourceCount >= 2) return "Limited" as const;
  return "Insufficient" as const;
}

function methodology(sources: FactCheckSource[], retrievedAt: string | null, searchPerformed: boolean) {
  const independentSourceCount = new Set(sources.map((source) => sourcePublisherKey(source.url))).size;
  return {
    searchPerformed,
    sourceCount: sources.length,
    independentSourceCount,
    tier1SourceCount: sources.filter((source) => source.tier === 1).length,
    tier2SourceCount: sources.filter((source) => source.tier === 2).length,
    tier3SourceCount: sources.filter((source) => source.tier === 3).length,
    evidenceQuality: evidenceQuality(sources, independentSourceCount),
    retrievedAt,
  };
}

export function buildNonFactualResult(classification: FactCheckClassification): FactCheckResult {
  const verdict = nonFactualVerdict(classification.claimType);
  return {
    verdict,
    truthScore: null,
    confidenceScore: classification.confidenceScore,
    category: classification.category,
    claimType: classification.claimType,
    factCheckable: false,
    summary: classification.summary,
    keyClaims: classification.claims.map((claim) => claim.text.slice(0, 500)),
    claims: classification.claims.map((claim, index) => ({
      id: `claim-${index + 1}`,
      text: claim.text,
      claimType: claim.claimType,
      factCheckable: false,
      verdict: nonFactualVerdict(claim.claimType),
      truthScore: null,
      confidenceScore: classification.confidenceScore,
      reasoning: classification.explanation,
      evidence: [],
    })),
    sources: [],
    analysis: classification.explanation,
    evidenceAssessment: "No factual verdict was issued because the content was classified as non-factual or not currently verifiable.",
    scoreRationale: "No truth score was assigned. Truth scores apply only to claims that can be checked against external evidence.",
    limitations: "This result classifies the nature of the content; it does not validate subjective quality, morality, personal belief, humor, or future outcomes.",
    uncertainties: "The intended tone or context may differ from the text or image alone.",
    recommendedAction: "Treat this content as opinion, rhetoric, humor, or speculation rather than verified fact. Look for a specific factual claim before relying on it.",
    disclaimer: "This is AI-generated, evidence-assisted analysis that may be wrong and is not final authority.",
    methodology: methodology([], null, false),
  };
}

function buildVerifiedSources(
  research: FactCheckResearch,
  retrievedSources: RetrievedSource[],
  retrievedAt: string,
) {
  const retrievedByUrl = new Map<string, RetrievedSource>();
  for (const source of retrievedSources) {
    const normalized = normalizeSourceUrl(source.url);
    if (normalized) retrievedByUrl.set(normalized, { ...source, url: normalized });
  }

  const referencedUrls = new Set(
    research.claims.flatMap((claim) => claim.evidence.map((item) => normalizeSourceUrl(item.sourceUrl))).filter((url): url is string => Boolean(url)),
  );

  const sources: FactCheckSource[] = [];
  for (const normalized of referencedUrls) {
    const retrieved = retrievedByUrl.get(normalized);
    if (!retrieved) continue;
    const ranking = rankSource(normalized);
    sources.push({
      title: retrieved.title.slice(0, 500),
      publisher: new URL(normalized).hostname.replace(/^www\./, "").slice(0, 300),
      publicationDate: null,
      url: normalized,
      retrievedAt,
      ...ranking,
    });
    if (sources.length === 10) break;
  }
  return sources;
}

function scoreClaim(
  evidence: FactCheckResult["claims"][number]["evidence"],
  sourcesByUrl: Map<string, FactCheckSource>,
  highRisk: boolean,
) {
  const directionalBySource = new Map(
    evidence
      .filter((item) => item.stance === "supports" || item.stance === "contradicts")
      .map((item) => [item.sourceUrl, item]),
  );
  const directional = Array.from(directionalBySource.values());
  const independentSources = new Set(directional.map((item) => sourcePublisherKey(item.sourceUrl)));
  if (directional.length < 2 || independentSources.size < 2) {
    return { truthScore: null, confidenceScore: Math.min(35, directional.length * 15) };
  }

  let supportingWeight = 0;
  let contradictingWeight = 0;
  for (const item of directional) {
    const source = sourcesByUrl.get(item.sourceUrl);
    const weight = source?.tier === 1 ? 3 : source?.tier === 2 ? 2 : 1;
    if (item.stance === "supports") supportingWeight += weight;
    else contradictingWeight += weight;
  }

  const totalWeight = supportingWeight + contradictingWeight;
  if (totalWeight === 0) return { truthScore: null, confidenceScore: 0 };
  const truthScore = Math.round((supportingWeight / totalWeight) * 100);
  const agreement = Math.abs(supportingWeight - contradictingWeight) / totalWeight;
  const sourceStrength = Math.min(35, totalWeight * 6);
  const independence = Math.min(24, independentSources.size * 8);
  const hasTier1 = directional.some((item) => sourcesByUrl.get(item.sourceUrl)?.tier === 1);
  const hasTier2 = directional.some((item) => sourcesByUrl.get(item.sourceUrl)?.tier === 2);
  const authority = hasTier1 ? 20 : hasTier2 ? 10 : 0;
  let confidenceScore = Math.min(100, Math.round(10 + sourceStrength + independence + authority + agreement * 11));
  if (highRisk && !hasTier1) confidenceScore = Math.min(confidenceScore, 55);
  return { truthScore, confidenceScore };
}

export function buildTrustedFactCheck(
  classification: FactCheckClassification,
  research: FactCheckResearch,
  retrievedSources: RetrievedSource[],
  retrievedAt = new Date().toISOString(),
): FactCheckResult {
  const sources = buildVerifiedSources(research, retrievedSources, retrievedAt);
  const sourcesByUrl = new Map(sources.map((source) => [source.url, source]));
  const highRisk = highRiskCategories.has(classification.category) || highRiskCategories.has(research.category);
  const claims = classification.claims.map((classifiedClaim, index) => {
    const researchedClaim = research.claims.find(
      (claim) => normalizedClaimText(claim.text) === normalizedClaimText(classifiedClaim.text),
    );
    const evidenceBySource = new Map<string, FactCheckResult["claims"][number]["evidence"][number]>();
    for (const item of researchedClaim?.evidence || []) {
      const sourceUrl = normalizeSourceUrl(item.sourceUrl);
      if (!sourceUrl || !sourcesByUrl.has(sourceUrl) || evidenceBySource.has(sourceUrl)) continue;
      evidenceBySource.set(sourceUrl, { ...item, sourceUrl });
    }
    const evidence = Array.from(evidenceBySource.values());
    if (!classifiedClaim.factCheckable) {
      return {
        id: `claim-${index + 1}`,
        text: classifiedClaim.text,
        claimType: classifiedClaim.claimType,
        factCheckable: false,
        verdict: nonFactualVerdict(classifiedClaim.claimType),
        truthScore: null,
        confidenceScore: classification.confidenceScore,
        reasoning: researchedClaim?.reasoning || classification.explanation,
        evidence,
      };
    }
    if (!researchedClaim) {
      return {
        id: `claim-${index + 1}`,
        text: classifiedClaim.text,
        claimType: classifiedClaim.claimType,
        factCheckable: true,
        verdict: "Unverifiable" as const,
        truthScore: null,
        confidenceScore: 0,
        reasoning: "The research stage did not return evidence for this classified claim, so no verdict or score was assigned.",
        evidence: [],
      };
    }
    const scores = scoreClaim(evidence, sourcesByUrl, highRisk);
    return {
      id: `claim-${index + 1}`,
      text: classifiedClaim.text,
      claimType: classifiedClaim.claimType,
      factCheckable: true,
      verdict: scores.truthScore === null ? "Unverifiable" as const : verdictFromScore(scores.truthScore),
      truthScore: scores.truthScore,
      confidenceScore: scores.confidenceScore,
      reasoning: researchedClaim.reasoning,
      evidence,
    };
  });

  const factualClaims = claims.filter((claim) => claim.factCheckable);
  const scoredClaims = factualClaims.filter((claim) => claim.truthScore !== null);
  const allFactualClaimsScored = factualClaims.length > 0 && scoredClaims.length === factualClaims.length;
  const truthScore = allFactualClaimsScored
    ? Math.round(scoredClaims.reduce((total, claim) => total + (claim.truthScore || 0) * Math.max(1, claim.confidenceScore), 0) /
        scoredClaims.reduce((total, claim) => total + Math.max(1, claim.confidenceScore), 0))
    : null;
  const confidenceScore = factualClaims.length
    ? Math.round(factualClaims.reduce((total, claim) => total + claim.confidenceScore, 0) / factualClaims.length)
    : classification.confidenceScore;
  const resultMethodology = methodology(sources, retrievedAt, true);
  const scoreRationale = truthScore === null
    ? `No overall truth score was assigned because ${factualClaims.length - scoredClaims.length || factualClaims.length} factual claim(s) lacked at least two independent sources with directional evidence.`
    : `The ${truthScore}/100 score is the confidence-weighted average of ${scoredClaims.length} independently scored claim(s). Evidence weights are Tier 1 = 3, Tier 2 = 2, and Tier 3 = 1; supporting and contradicting weights determine each claim score.`;

  return {
    verdict: truthScore === null ? "Unverifiable" : verdictFromScore(truthScore),
    truthScore,
    confidenceScore,
    category: research.category,
    claimType: research.claimType,
    factCheckable: true,
    summary: research.summary,
    keyClaims: claims.map((claim) => claim.text.slice(0, 500)),
    claims,
    sources,
    analysis: research.analysis,
    evidenceAssessment: research.evidenceAssessment,
    scoreRationale,
    limitations: research.limitations,
    uncertainties: research.uncertainties,
    recommendedAction: research.recommendedAction,
    disclaimer: research.disclaimer,
    methodology: resultMethodology,
  };
}