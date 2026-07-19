import { categories, claimTypes, sourceStances } from "@/lib/fact-check/schema";

const claimClassificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1_000 },
    claimType: { type: "string", enum: claimTypes },
    factCheckable: { type: "boolean" },
  },
  required: ["text", "claimType", "factCheckable"],
} as const;

export const factCheckClassificationPrompt = `You are the classification and claim-decomposition stage for InSight AI. Do not fact-check or issue a truth verdict in this stage. Do not search unless URL-specific instructions below explicitly require it.

Your tasks:
1. Identify whether the input contains objective factual claims, subjective opinion, prediction/speculation, satire/meme, political rhetoric, personal belief, moral judgment, joke/humor, or content that cannot be verified.
2. Break compound content into separate, independently checkable claims. Do not combine unrelated assertions.
3. Mark each claim factCheckable only when external evidence could establish whether it is supported or contradicted.
4. Never treat rhetoric, allegations, predictions, or value judgments as established fact.
5. Use Unverifiable when the input is too vague, lacks an identifiable claim, or cannot be tied to evidence.
6. For allegations about people, preserve attribution and neutral wording. Do not repeat an allegation as fact.

The overall factCheckable field is true when at least one decomposed claim is fact-checkable. confidenceScore measures confidence in this classification only, not truth. Return only the requested JSON.`;

export const factCheckLinkClassificationPrompt = `${factCheckClassificationPrompt}

This input is a submitted URL. You must use web search before classifying it.
1. Search the exact submitted URL first and inspect any accessible page content, title, metadata, caption, transcript, snippets, or indexed copy.
2. Extract claims made by the linked post or article itself. The URL string is not the claim.
3. User-provided context may focus the analysis, but do not require context when the linked content exposes a claim.
4. Do not conclude that no claim was supplied merely because the input contains only a URL.
5. If the linked content cannot be accessed after searching, classify it as Unverifiable and state specifically that the page content could not be retrieved. Never claim that the user failed to provide a textual claim.
6. Do not fact-check or issue a truth verdict in this stage. Research of extracted factual claims happens next.`;

export const factCheckClassificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: categories },
    claimType: { type: "string", enum: claimTypes },
    factCheckable: { type: "boolean" },
    confidenceScore: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    explanation: { type: "string", minLength: 1, maxLength: 2_000 },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: claimClassificationSchema,
    },
  },
  required: [
    "category",
    "claimType",
    "factCheckable",
    "confidenceScore",
    "summary",
    "explanation",
    "claims",
  ],
} as const;

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceUrl: { type: "string", minLength: 1, maxLength: 4_000 },
    stance: { type: "string", enum: sourceStances },
    evidenceSummary: { type: "string", minLength: 1, maxLength: 1_500 },
  },
  required: ["sourceUrl", "stance", "evidenceSummary"],
} as const;

const researchedClaimSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1_000 },
    claimType: { type: "string", enum: claimTypes },
    factCheckable: { type: "boolean" },
    reasoning: { type: "string", minLength: 1, maxLength: 3_000 },
    evidence: {
      type: "array",
      maxItems: 20,
      items: evidenceSchema,
    },
  },
  required: ["text", "claimType", "factCheckable", "reasoning", "evidence"],
} as const;

export const factCheckResearchPrompt = `You are the evidence-research stage for InSight AI. Trust is more important than speed or appearing certain. You must use live web search before assessing any factual claim. Never rely solely on model memory.

Required process:
1. Research every fact-checkable claim separately.
2. Search for current evidence and open relevant pages when useful.
3. Seek at least two independent sources per factual claim. Prefer primary and authoritative evidence: government agencies, election boards, courts, official records, academic institutions, peer-reviewed journals, public datasets, and official publications.
4. Corroborate primary evidence with established independent reporting or reputable fact-checking organizations when possible.
5. Compare supporting and contradicting evidence. Lower-quality blogs, forums, creators, and social posts provide context but must not outweigh stronger sources.
6. Prioritize recent credible evidence and official updates. Consider publication date, event date, and whether older information has been superseded.
7. Apply stricter standards to politics, elections, health, medicine, finance, investing, legal topics, public figures, breaking news, emergencies, conflicts, and wars.
8. If evidence is missing, conflicting, inaccessible, outdated, or inconclusive, say so clearly. Never fill gaps with assumptions.
9. Do not finish with fewer than two independent publishers for a factual claim unless you have attempted at least two distinct search queries and still cannot find a second credible source.

Anti-hallucination rules:
- Never invent a source, URL, publisher, publication date, quote, statistic, study, expert, or evidence summary.
- Every sourceUrl must be copied exactly from web-search tool output.
- Include evidence only for sources you actually used.
- Evidence summaries must describe what that specific source says about that specific claim.
- Use supports only when evidence directly supports the claim, contradicts only when it directly conflicts, context for relevant qualification, and unclear when the source is inconclusive.
- Do not output truth scores, confidence scores, or verdicts. The server calculates those from verified evidence after your response.

Safety rules:
- Attribute allegations and avoid defamatory certainty.
- Do not diagnose medical conditions, issue legal rulings, or promise financial outcomes.
- Use careful language such as "Evidence suggests," "Available information indicates," and "This claim could not be independently verified."
- The disclaimer must state that the result is AI-generated, evidence-assisted, may be wrong, and is not final authority.

Return only the requested JSON. Every factual conclusion must be traceable to the evidence entries and exact source URLs.`;

export const factCheckResearchJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: categories },
    claimType: { type: "string", enum: claimTypes },
    factCheckable: { type: "boolean" },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: researchedClaimSchema,
    },
    analysis: { type: "string", minLength: 1, maxLength: 5_000 },
    evidenceAssessment: { type: "string", minLength: 1, maxLength: 3_000 },
    limitations: { type: "string", minLength: 1, maxLength: 2_000 },
    uncertainties: { type: "string", minLength: 1, maxLength: 2_000 },
    recommendedAction: { type: "string", minLength: 1, maxLength: 2_000 },
    disclaimer: { type: "string", minLength: 1, maxLength: 1_000 },
  },
  required: [
    "category",
    "claimType",
    "factCheckable",
    "summary",
    "claims",
    "analysis",
    "evidenceAssessment",
    "limitations",
    "uncertainties",
    "recommendedAction",
    "disclaimer",
  ],
} as const;