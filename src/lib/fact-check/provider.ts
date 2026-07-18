import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
} from "openai/resources/responses/responses";
import type { ZodType } from "zod";
import { ConfigurationError, getServerEnvironment } from "@/lib/env";
import {
  factCheckClassificationJsonSchema,
  factCheckClassificationPrompt,
  factCheckResearchJsonSchema,
  factCheckResearchPrompt,
} from "@/lib/fact-check/prompt";
import {
  factCheckClassificationSchema,
  factCheckResearchSchema,
  factCheckResultSchema,
  type FactCheckClassification,
  type FactCheckResearch,
  type FactCheckResult,
  type FactCheckSubmission,
} from "@/lib/fact-check/schema";
import {
  buildNonFactualResult,
  buildTrustedFactCheck,
  normalizeSourceUrl,
  sourcePublisherKey,
  type RetrievedSource,
} from "@/lib/fact-check/trust-engine";
import { logServerInfo } from "@/lib/server-log";

type AnalysisInput = FactCheckSubmission & { imageDataUrl?: string };
type BoundedResponseCreateParams = ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number | null;
};

const analysisBudgetMilliseconds = 165_000;

function requestOptions(deadline: number, stageMaximumMilliseconds: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const error = new Error("The analysis deadline was exceeded.");
    error.name = "TimeoutError";
    throw error;
  }
  return { signal: AbortSignal.timeout(Math.max(1_000, Math.min(remaining, stageMaximumMilliseconds))) };
}

function describeInput(input: AnalysisInput) {
  if (input.inputType === "link") {
    return [
      "Input type: link",
      `Submitted URL: ${input.url}`,
      `User-provided context: ${input.text || "None provided"}`,
    ].join("\n");
  }

  if (input.inputType === "screenshot") {
    return [
      "Input type: screenshot",
      "Analyze only content visible in the attached image and the optional context.",
      `User-provided context: ${input.text || "None provided"}`,
    ].join("\n");
  }

  return `Input type: text\nSubmitted content:\n${input.text}`;
}

function createContent(text: string, imageDataUrl?: string) {
  return imageDataUrl
    ? [
        { type: "input_text" as const, text },
        { type: "input_image" as const, image_url: imageDataUrl, detail: "auto" as const },
      ]
    : [{ type: "input_text" as const, text }];
}

function parseStructured<T>(content: string | null, schema: ZodType<T>): T | null {
  if (!content) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function extractRetrievedSources(output: ResponseOutputItem[]): RetrievedSource[] {
  const sources = new Map<string, RetrievedSource>();

  for (const item of output) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations || []) {
        if (annotation.type !== "url_citation") continue;
        const normalized = normalizeSourceUrl(annotation.url);
        if (normalized) sources.set(normalized, { title: annotation.title.slice(0, 500), url: normalized });
      }
    }
  }

  for (const item of output) {
    if (item.type !== "web_search_call" || item.action.type !== "search") continue;
    for (const source of item.action.sources || []) {
      const normalized = normalizeSourceUrl(source.url);
      if (!normalized || sources.has(normalized)) continue;
      sources.set(normalized, {
        title: new URL(normalized).hostname.replace(/^www\./, ""),
        url: normalized,
      });
    }
  }

  return Array.from(sources.values()).slice(0, 30);
}

function searchCallCount(output: ResponseOutputItem[]) {
  return output.filter((item) => item.type === "web_search_call").length;
}

function logCompletion(
  environment: ReturnType<typeof getServerEnvironment>,
  input: AnalysisInput,
  startedAt: number,
  classificationAttempts: number,
  researchAttempts: number,
  searchCalls: number,
  result: FactCheckResult,
) {
  logServerInfo("fact_check.analysis_completed", {
    provider: "openai",
    model: environment.OPENAI_MODEL,
    inputType: input.inputType,
    durationMs: Date.now() - startedAt,
    classificationAttempts,
    researchAttempts,
    searchCalls,
    factCheckable: result.factCheckable,
    claimCount: result.claims.length,
    sourceCount: result.methodology.sourceCount,
    independentSourceCount: result.methodology.independentSourceCount,
    evidenceQuality: result.methodology.evidenceQuality,
    verdict: result.verdict,
    truthScore: result.truthScore,
    confidenceScore: result.confidenceScore,
  });
}

async function classifyInput(
  openai: OpenAI,
  model: string,
  content: ReturnType<typeof createContent>,
  deadline: number,
) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await openai.responses.create({
      model,
      instructions: factCheckClassificationPrompt,
      input: [{ role: "user", content }],
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 4_000,
      text: {
        format: {
          type: "json_schema",
          name: "fact_check_classification",
          strict: true,
          schema: factCheckClassificationJsonSchema,
        },
      },
    }, requestOptions(deadline, 30_000));
    const classification = parseStructured(response.output_text, factCheckClassificationSchema);
    if (classification) {
      return {
        classification: {
          ...classification,
          factCheckable: classification.claims.some((claim) => claim.factCheckable),
        } satisfies FactCheckClassification,
        attempts: attempt,
      };
    }
  }
  throw new Error("The classification stage returned an invalid structured response.");
}

async function researchClaims(
  openai: OpenAI,
  model: string,
  input: AnalysisInput,
  classification: FactCheckClassification,
  deadline: number,
) {
  const researchText = [
    describeInput(input),
    "",
    "Claim decomposition from the classification stage:",
    JSON.stringify(classification.claims),
  ].join("\n");
  const factualClaimCount = classification.claims.filter((claim) => claim.factCheckable).length;
  const maximumSearchCalls = Math.min(6, Math.max(2, factualClaimCount * 2));
  let retryGuidance = "";
  let totalSearchCalls = 0;
  let insufficientFallback: { research: FactCheckResearch; retrievedSources: RetrievedSource[] } | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const content = createContent(`${researchText}${retryGuidance}`, input.imageDataUrl);
    const request: BoundedResponseCreateParams = {
      model,
      instructions: factCheckResearchPrompt,
      input: [{ role: "user", content }],
      reasoning: { effort: "medium" },
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      max_tool_calls: maximumSearchCalls,
      include: ["web_search_call.action.sources"],
      store: false,
      max_output_tokens: 12_000,
      text: {
        format: {
          type: "json_schema",
          name: "fact_check_research",
          strict: true,
          schema: factCheckResearchJsonSchema,
        },
      },
    };
    const response = await openai.responses.create(request, requestOptions(deadline, 120_000));
    totalSearchCalls += searchCallCount(response.output);
    const research = parseStructured(response.output_text, factCheckResearchSchema);
    if (!research) continue;
    const retrievedSources = extractRetrievedSources(response.output);
    const publishers = new Set(retrievedSources.map((source) => sourcePublisherKey(source.url)));
    if (publishers.size < 2 && attempt === 1) {
      insufficientFallback = { research: { ...research, factCheckable: true }, retrievedSources };
      retryGuidance = [
        "\n\nThe prior research pass found fewer than two independent publishers.",
        `Do not rely only on these previously seen publishers: ${Array.from(publishers).join(", ") || "none"}.`,
        "Run a different search query and seek an independent primary or established source. If none exists, clearly report that limitation.",
      ].join("\n");
      continue;
    }
    return {
      research: {
        ...research,
        factCheckable: true,
      } satisfies FactCheckResearch,
      retrievedSources,
      searchCalls: totalSearchCalls,
      attempts: attempt,
    };
  }
  if (insufficientFallback) {
    return {
      ...insufficientFallback,
      searchCalls: totalSearchCalls,
      attempts: 2,
    };
  }
  throw new Error("The research stage returned an invalid structured response.");
}

export async function analyzeFactCheck(input: AnalysisInput) {
  const startedAt = Date.now();
  const deadline = startedAt + analysisBudgetMilliseconds;
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) throw new ConfigurationError("OPENAI_API_KEY");

  const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
  const classificationStage = await classifyInput(
    openai,
    environment.OPENAI_MODEL,
    createContent(describeInput(input), input.imageDataUrl),
    deadline,
  );

  if (!classificationStage.classification.factCheckable) {
    const result = buildNonFactualResult(classificationStage.classification);
    logCompletion(environment, input, startedAt, classificationStage.attempts, 0, 0, result);
    return result;
  }

  const researchStage = await researchClaims(
    openai,
    environment.OPENAI_MODEL,
    input,
    classificationStage.classification,
    deadline,
  );
  const candidate = buildTrustedFactCheck(
    classificationStage.classification,
    researchStage.research,
    researchStage.retrievedSources,
  );
  const validated = factCheckResultSchema.safeParse(candidate);
  if (!validated.success) throw new Error("The trust engine produced an invalid result.");

  logCompletion(
    environment,
    input,
    startedAt,
    classificationStage.attempts,
    researchStage.attempts,
    researchStage.searchCalls,
    validated.data,
  );
  return validated.data;
}