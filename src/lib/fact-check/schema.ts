import { z } from "zod";

const inputTypes = ["text", "link", "screenshot"] as const;
export const verdicts = [
  "True",
  "Mostly True",
  "Mixed",
  "Misleading",
  "Mostly False",
  "False",
  "Unverifiable",
  "Opinion / Not Fact Checkable",
  "Prediction / Not Yet Verifiable",
  "Opinion / Subjective",
  "Satire / Meme",
  "Outdated Context",
] as const;
export const categories = [
  "Politics",
  "Elections",
  "Health",
  "Finance",
  "Legal",
  "Science",
  "Technology",
  "Entertainment",
  "Sports",
  "Breaking News",
  "Conflict / War",
  "Meme / Satire",
  "General",
  "Opinion",
  "Other",
] as const;
export const claimTypes = [
  "Factual Claim",
  "Opinion / Subjective",
  "Prediction / Speculation",
  "Satire / Meme",
  "Political Rhetoric",
  "Personal Belief",
  "Moral Claim",
  "Joke / Humor",
  "Unverifiable",
] as const;
export const sourceStances = ["supports", "contradicts", "context", "unclear"] as const;
export const sourceTierLabels = [
  "Tier 1 - Primary / authoritative",
  "Tier 2 - Established / official",
  "Tier 3 - Other / user-generated",
] as const;
const evidenceQualityLevels = ["Strong", "Moderate", "Limited", "Insufficient"] as const;

const webUrlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URLs must use http or https.",
  });

const factCheckSourceSchema = z.object({
  title: z.string().trim().min(1).max(500),
  publisher: z.string().trim().max(300).default(""),
  publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  url: webUrlSchema,
  retrievedAt: z.string().datetime().nullable().default(null),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  tierLabel: z.enum(sourceTierLabels).default("Tier 3 - Other / user-generated"),
});

const factCheckEvidenceSchema = z.object({
  sourceUrl: webUrlSchema,
  stance: z.enum(sourceStances),
  evidenceSummary: z.string().trim().min(1).max(500),
});

const factCheckClaimSchema = z.object({
  id: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(500),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean(),
  verdict: z.enum(verdicts),
  truthScore: z.number().int().min(0).max(100).nullable(),
  confidenceScore: z.number().int().min(0).max(100),
  reasoning: z.string().trim().min(1).max(3_000),
  evidence: z.array(factCheckEvidenceSchema).max(20).default([]),
});

const factCheckMethodologySchema = z.object({
  searchPerformed: z.boolean(),
  sourceCount: z.number().int().min(0),
  independentSourceCount: z.number().int().min(0),
  tier1SourceCount: z.number().int().min(0),
  tier2SourceCount: z.number().int().min(0),
  tier3SourceCount: z.number().int().min(0),
  evidenceQuality: z.enum(evidenceQualityLevels),
  retrievedAt: z.string().datetime().nullable(),
});

const factCheckClassificationClaimSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean(),
});

export const factCheckClassificationSchema = z.object({
  category: z.enum(categories),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean(),
  confidenceScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(240),
  explanation: z.string().trim().min(1).max(600),
  claims: z.array(factCheckClassificationClaimSchema).min(1).max(5),
});

const factCheckResearchClaimSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean(),
  reasoning: z.string().trim().min(1).max(800),
  evidence: z.array(factCheckEvidenceSchema).max(8),
});

export const factCheckResearchSchema = z.object({
  category: z.enum(categories),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean(),
  summary: z.string().trim().min(1).max(240),
  claims: z.array(factCheckResearchClaimSchema).min(1).max(5),
  analysis: z.string().trim().min(1).max(1_200),
  evidenceAssessment: z.string().trim().min(1).max(800),
  limitations: z.string().trim().min(1).max(600),
  uncertainties: z.string().trim().min(1).max(600),
  recommendedAction: z.string().trim().min(1).max(500),
  disclaimer: z.string().trim().min(1).max(300),
});

export const factCheckSubmissionSchema = z
  .object({
    inputType: z.enum(inputTypes),
    text: z.string().trim().max(15_000, "Text must be 15,000 characters or fewer."),
    url: z.string().trim().max(2_048, "The URL is too long."),
    idempotencyKey: z.string().uuid("The submission identifier is invalid."),
  })
  .superRefine((submission, context) => {
    if (submission.inputType === "text" && submission.text.length < 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "Enter at least 5 characters to check.",
      });
    }

    if (submission.inputType === "link") {
      try {
        const url = new URL(submission.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Enter a valid http or https URL.",
        });
      }
    }
  });

export const factCheckResultSchema = z.object({
  verdict: z.enum(verdicts),
  truthScore: z.number().int().min(0).max(100).nullable(),
  confidenceScore: z.number().int().min(0).max(100),
  category: z.enum(categories),
  claimType: z.enum(claimTypes),
  factCheckable: z.boolean().default(true),
  summary: z.string().trim().min(1).max(500),
  keyClaims: z.array(z.string().trim().min(1).max(500)).max(10),
  analysis: z.string().trim().min(1).max(5_000),
  evidenceAssessment: z.string().trim().min(1).max(3_000),
  scoreRationale: z.string().trim().min(1).max(2_000).default("This legacy result did not store a separate score rationale."),
  limitations: z.string().trim().min(1).max(2_000),
  uncertainties: z.string().trim().min(1).max(2_000).default("This legacy result did not store a separate uncertainty assessment."),
  recommendedAction: z.string().trim().min(1).max(2_000),
  disclaimer: z.string().trim().min(1).max(1_000),
  claims: z.array(factCheckClaimSchema).max(10).default([]),
  sources: z.array(factCheckSourceSchema).max(10).default([]),
  methodology: factCheckMethodologySchema.default({
    searchPerformed: false,
    sourceCount: 0,
    independentSourceCount: 0,
    tier1SourceCount: 0,
    tier2SourceCount: 0,
    tier3SourceCount: 0,
    evidenceQuality: "Insufficient",
    retrievedAt: null,
  }),
});

export type InputType = (typeof inputTypes)[number];
export type FactCheckSubmission = z.infer<typeof factCheckSubmissionSchema>;
export type FactCheckResult = z.infer<typeof factCheckResultSchema>;
export type FactCheckSource = z.infer<typeof factCheckSourceSchema>;
export type FactCheckClassification = z.infer<typeof factCheckClassificationSchema>;
export type FactCheckResearch = z.infer<typeof factCheckResearchSchema>;