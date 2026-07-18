import { z } from "zod";

export const inputTypes = ["text", "link", "screenshot"] as const;
export const verdicts = [
  "True",
  "Mostly True",
  "Mixed",
  "Misleading",
  "Mostly False",
  "False",
  "Unverifiable",
  "Opinion / Subjective",
  "Satire / Meme",
  "Outdated Context",
] as const;
export const categories = [
  "Politics",
  "Health",
  "Finance",
  "Science",
  "Technology",
  "Entertainment",
  "Sports",
  "Meme / Satire",
  "General",
  "Opinion",
  "Other",
] as const;
export const claimTypes = [
  "Factual Claim",
  "Opinion / Subjective",
  "Satire / Meme",
  "Unverifiable",
] as const;

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
  truthScore: z.number().int().min(0).max(100),
  confidenceScore: z.number().int().min(0).max(100),
  category: z.enum(categories),
  claimType: z.enum(claimTypes),
  summary: z.string().trim().min(1).max(500),
  keyClaims: z.array(z.string().trim().min(1).max(500)).max(10),
  analysis: z.string().trim().min(1).max(5_000),
  evidenceAssessment: z.string().trim().min(1).max(3_000),
  limitations: z.string().trim().min(1).max(2_000),
  recommendedAction: z.string().trim().min(1).max(2_000),
  disclaimer: z.string().trim().min(1).max(1_000),
});

export type InputType = (typeof inputTypes)[number];
export type FactCheckSubmission = z.infer<typeof factCheckSubmissionSchema>;
export type FactCheckResult = z.infer<typeof factCheckResultSchema>;