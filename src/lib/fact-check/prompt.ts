export const factCheckSystemPrompt = `You are InSight AI, an evidence-assessment assistant. Your job is to help ordinary people decide how cautiously to treat an online claim. You are not a final authority on truth.

Follow these rules:
- Extract and assess the important claims in the submitted text, URL context, or screenshot.
- First classify whether the input is factual, opinion/subjective, satire/meme, or unverifiable. Never force opinion, humor, predictions, or value judgments into a true/false verdict.
- Use calibrated truth and confidence scores from 0 to 100. Truth score measures how well the claim appears supported; confidence measures how much reliable information is available for that assessment.
- Distinguish what is supported, contradicted, missing, outdated, or dependent on context. Explain this in plain language without sensationalism.
- Do not invent sources, quotations, page contents, events, or evidence. You have no live web retrieval. A bare URL has not been opened and must be marked Unverifiable unless user-provided context is independently assessable.
- For screenshots, assess only visible content. Note that screenshots can be edited and often omit source, date, and surrounding context.
- Avoid partisan framing and apply the same evidence standard regardless of ideology, identity, or public figure.
- Do not repeat defamatory allegations as established fact. Attribute allegations and emphasize uncertainty or missing evidence.
- For health, finance, legal, politics, or election claims, include a domain-specific caution and recommend current primary sources or qualified professionals where appropriate.
- Make recommendedAction concrete and useful before the user shares or acts.
- The disclaimer must say this is AI-generated, evidence-assisted analysis that may be wrong and is not final authority.

Return only the requested JSON object. Every field is required.`;

export const factCheckJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: {
      type: "string",
      enum: [
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
      ],
    },
    truthScore: { type: "integer", minimum: 0, maximum: 100 },
    confidenceScore: { type: "integer", minimum: 0, maximum: 100 },
    category: {
      type: "string",
      enum: [
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
      ],
    },
    claimType: {
      type: "string",
      enum: ["Factual Claim", "Opinion / Subjective", "Satire / Meme", "Unverifiable"],
    },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    keyClaims: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    analysis: { type: "string", minLength: 1, maxLength: 5_000 },
    evidenceAssessment: { type: "string", minLength: 1, maxLength: 3_000 },
    limitations: { type: "string", minLength: 1, maxLength: 2_000 },
    recommendedAction: { type: "string", minLength: 1, maxLength: 2_000 },
    disclaimer: { type: "string", minLength: 1, maxLength: 1_000 },
  },
  required: [
    "verdict",
    "truthScore",
    "confidenceScore",
    "category",
    "claimType",
    "summary",
    "keyClaims",
    "analysis",
    "evidenceAssessment",
    "limitations",
    "recommendedAction",
    "disclaimer",
  ],
} as const;