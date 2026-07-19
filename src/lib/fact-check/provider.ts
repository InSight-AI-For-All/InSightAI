import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
  ResponseUsage,
} from "openai/resources/responses/responses";
import type { ZodType } from "zod";
import { ConfigurationError, getServerEnvironment } from "@/lib/env";
import { getFactCheckConfig, modelPricing, selectResearchRoute } from "@/lib/fact-check/config";
import { extractCandidateText } from "@/lib/fact-check/cost-controls";
import {
  factCheckClassificationJsonSchema,
  factCheckLinkClassificationPrompt,
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
import { retrieveLinkedPage } from "@/lib/fact-check/linked-page";
import {
  buildNonFactualResult,
  buildTrustedFactCheck,
  buildUnsearchedFactualResult,
  normalizeSourceUrl,
  type RetrievedSource,
} from "@/lib/fact-check/trust-engine";
import { logServerInfo } from "@/lib/server-log";
import { recordAiUsage, recordError, recordWebSearch } from "@/lib/telemetry/server";

type AnalysisInput = FactCheckSubmission & { imageDataUrl?: string; linkedPageContent?: string };
type AnalysisTelemetryContext = {
  userId?: string;
  requestId?: string;
  factCheckLogId?: string | null;
  plan?: string;
  inputTruncated?: boolean;
  maxInputChars?: number;
};
type BoundedResponseCreateParams = ResponseCreateParamsNonStreaming & { max_tool_calls?: number | null };
type UsageTotals = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
type StageResult<T> = {
  value: T;
  model: string;
  usage: UsageTotals;
  attempts: number;
  jsonRepair: boolean;
  searchCalls: number;
  retrievedSources: RetrievedSource[];
};

const analysisBudgetMilliseconds = 120_000;
const webSearchCost = 0.01;

function emptyUsage(): UsageTotals {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

function addUsage(total: UsageTotals, usage: ResponseUsage | undefined) {
  if (!usage) return;
  total.inputTokens += usage.input_tokens;
  total.cachedInputTokens += usage.input_tokens_details.cached_tokens;
  total.outputTokens += usage.output_tokens;
}

function estimatedOpenAiCost(model: string, usage: UsageTotals, searchCalls: number) {
  const pricing = modelPricing(model);
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    uncachedInput * pricing.input / 1_000_000 +
    usage.cachedInputTokens * pricing.cachedInput / 1_000_000 +
    usage.outputTokens * pricing.output / 1_000_000 +
    searchCalls * webSearchCost
  );
}

export class FactCheckAnalysisError extends Error {
  constructor(
    message: string,
    public readonly aiUsed: boolean,
    public readonly code: "LINK_CONTENT_UNAVAILABLE" | "ANALYSIS_FAILED",
  ) {
    super(message);
    this.name = "FactCheckAnalysisError";
  }
}

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
      "type=link",
      `url=${input.url}`,
      input.text ? `context=${input.text}` : "",
      input.linkedPageContent ? `page_text_untrusted:\n${input.linkedPageContent}` : "page_text_unavailable",
    ].filter(Boolean).join("\n");
  }
  if (input.inputType === "screenshot") {
    return `type=screenshot\ncontext=${input.text || "none"}\nExtract visible claims from the image.`;
  }
  return `type=text\n${input.text}`;
}

function createContent(text: string, imageDataUrl?: string) {
  return imageDataUrl
    ? [
        { type: "input_text" as const, text },
        { type: "input_image" as const, image_url: imageDataUrl, detail: "low" as const },
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
      sources.set(normalized, { title: new URL(normalized).hostname.replace(/^www\./, ""), url: normalized });
    }
  }
  return Array.from(sources.values()).slice(0, 20);
}

function searchCallCount(output: ResponseOutputItem[]) {
  return output.filter((item) => item.type === "web_search_call").length;
}

async function repairStructured<T>(input: {
  openai: OpenAI;
  model: string;
  malformed: string;
  schema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  deadline: number;
  maxOutputTokens: number;
  onAiRequest: () => void;
}) {
  const usage = emptyUsage();
  const request: BoundedResponseCreateParams = {
    model: input.model,
    instructions: "Repair the supplied JSON to match the schema. Preserve meaning; add no facts or sources. Return JSON only.",
    input: input.malformed.slice(0, 12_000),
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: input.maxOutputTokens,
    text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.jsonSchema } },
  };
  input.onAiRequest();
  const response = await input.openai.responses.create(request, requestOptions(input.deadline, 25_000));
  addUsage(usage, response.usage);
  return { value: parseStructured(response.output_text, input.schema), usage };
}

async function classifyInput(
  openai: OpenAI,
  model: string,
  input: AnalysisInput,
  deadline: number,
  maxOutputTokens: number,
  onAiRequest: () => void,
): Promise<StageResult<FactCheckClassification>> {
  const usage = emptyUsage();
  const request: BoundedResponseCreateParams = {
    model,
    instructions: input.inputType === "link" ? factCheckLinkClassificationPrompt : factCheckClassificationPrompt,
    input: [{ role: "user", content: createContent(describeInput(input), input.imageDataUrl) }],
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: Math.min(1_200, maxOutputTokens),
    text: { format: { type: "json_schema", name: "fact_check_classification", strict: true, schema: factCheckClassificationJsonSchema } },
  };
  onAiRequest();
  const response = await openai.responses.create(request, requestOptions(deadline, 30_000));
  addUsage(usage, response.usage);
  let classification = parseStructured(response.output_text, factCheckClassificationSchema);
  let attempts = 1;
  let jsonRepair = false;
  if (!classification) {
    const repaired = await repairStructured({
      openai,
      model,
      malformed: response.output_text || "{}",
      schema: factCheckClassificationSchema,
      jsonSchema: factCheckClassificationJsonSchema as unknown as Record<string, unknown>,
      schemaName: "fact_check_classification_repair",
      deadline,
      maxOutputTokens: Math.min(1_200, maxOutputTokens),
      onAiRequest,
    });
    usage.inputTokens += repaired.usage.inputTokens;
    usage.cachedInputTokens += repaired.usage.cachedInputTokens;
    usage.outputTokens += repaired.usage.outputTokens;
    classification = repaired.value;
    attempts = 2;
    jsonRepair = true;
  }
  if (!classification) throw new Error("The classification stage returned invalid structured output.");
  return {
    value: { ...classification, factCheckable: classification.claims.some((claim) => claim.factCheckable) },
    model,
    usage,
    attempts,
    jsonRepair,
    searchCalls: 0,
    retrievedSources: [],
  };
}

async function researchClaims(
  openai: OpenAI,
  model: string,
  classification: FactCheckClassification,
  route: ReturnType<typeof selectResearchRoute>,
  deadline: number,
  maxOutputTokens: number,
  onAiRequest: () => void,
): Promise<StageResult<FactCheckResearch>> {
  const usage = emptyUsage();
  const request: BoundedResponseCreateParams = {
    model,
    instructions: factCheckResearchPrompt,
    input: `claims=${JSON.stringify(classification.claims.filter((claim) => claim.factCheckable))}`,
    reasoning: { effort: route.route === "high_risk" ? "medium" : "low" },
    tools: [{ type: "web_search", search_context_size: route.searchContextSize }],
    tool_choice: "required",
    max_tool_calls: route.maxSearchCalls,
    include: ["web_search_call.action.sources"],
    store: false,
    max_output_tokens: maxOutputTokens,
    text: { format: { type: "json_schema", name: "fact_check_research", strict: true, schema: factCheckResearchJsonSchema } },
  };
  onAiRequest();
  const response = await openai.responses.create(request, requestOptions(deadline, 85_000));
  addUsage(usage, response.usage);
  let research = parseStructured(response.output_text, factCheckResearchSchema);
  let attempts = 1;
  let jsonRepair = false;
  if (!research) {
    const repaired = await repairStructured({
      openai,
      model,
      malformed: response.output_text || "{}",
      schema: factCheckResearchSchema,
      jsonSchema: factCheckResearchJsonSchema as unknown as Record<string, unknown>,
      schemaName: "fact_check_research_repair",
      deadline,
      maxOutputTokens,
      onAiRequest,
    });
    usage.inputTokens += repaired.usage.inputTokens;
    usage.cachedInputTokens += repaired.usage.cachedInputTokens;
    usage.outputTokens += repaired.usage.outputTokens;
    research = repaired.value;
    attempts = 2;
    jsonRepair = true;
  }
  if (!research) throw new Error("The research stage returned invalid structured output.");
  const output = response.output || [];
  return {
    value: { ...research, factCheckable: true },
    model,
    usage,
    attempts,
    jsonRepair,
    searchCalls: searchCallCount(output),
    retrievedSources: extractRetrievedSources(output),
  };
}

async function logStage(input: {
  stage: "classification" | "research";
  result: StageResult<unknown>;
  context?: AnalysisTelemetryContext;
  route: "cheap" | "default" | "high_risk";
}) {
  return recordAiUsage({
    factCheckLogId: input.context?.factCheckLogId,
    userId: input.context?.userId,
    requestId: input.context?.requestId,
    model: input.result.model,
    requestType: "fact_check",
    stage: input.stage,
    status: "completed",
    promptTokens: input.result.usage.inputTokens,
    cachedPromptTokens: input.result.usage.cachedInputTokens,
    completionTokens: input.result.usage.outputTokens,
    estimatedCostUsd: Number(estimatedOpenAiCost(input.result.model, input.result.usage, input.result.searchCalls).toFixed(8)),
    retryCount: input.result.attempts - 1,
    jsonParseFailure: input.result.jsonRepair,
    metadata: {
      route: input.route,
      webSearchUsed: input.result.searchCalls > 0,
      searchCalls: input.result.searchCalls,
      cacheHit: false,
      plan: input.context?.plan || "unknown",
      inputTruncated: Boolean(input.context?.inputTruncated),
    },
  });
}

async function logCompletion(input: {
  sourceInput: AnalysisInput;
  startedAt: number;
  classification: StageResult<FactCheckClassification>;
  research?: StageResult<FactCheckResearch>;
  result: FactCheckResult;
  route: "cheap" | "default" | "high_risk";
  context?: AnalysisTelemetryContext;
}) {
  const classificationLogId = await logStage({ stage: "classification", result: input.classification, context: input.context, route: "cheap" });
  const researchLogId = input.research
    ? await logStage({ stage: "research", result: input.research, context: input.context, route: input.route })
    : null;
  if (input.research?.searchCalls) {
    await recordWebSearch({
      aiUsageLogId: researchLogId || classificationLogId,
      factCheckLogId: input.context?.factCheckLogId,
      userId: input.context?.userId,
      requestId: input.context?.requestId,
      status: "completed",
      queryCount: input.research.searchCalls,
      sourceCount: input.result.methodology.sourceCount,
      citationCount: input.result.sources.length,
      latencyMs: Date.now() - input.startedAt,
      metadata: { route: input.route, independentSourceCount: input.result.methodology.independentSourceCount },
    });
  }
  logServerInfo("fact_check.analysis_completed", {
    classifierModel: input.classification.model,
    researchModel: input.research?.model || null,
    route: input.route,
    inputType: input.sourceInput.inputType,
    durationMs: Date.now() - input.startedAt,
    searchCalls: input.research?.searchCalls || 0,
    inputTokens: input.classification.usage.inputTokens + (input.research?.usage.inputTokens || 0),
    outputTokens: input.classification.usage.outputTokens + (input.research?.usage.outputTokens || 0),
    verdict: input.result.verdict,
    truthScore: input.result.truthScore,
    confidenceScore: input.result.confidenceScore,
  });
}

export async function analyzeFactCheck(input: AnalysisInput, telemetryContext?: AnalysisTelemetryContext) {
  const startedAt = Date.now();
  const deadline = startedAt + analysisBudgetMilliseconds;
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) throw new ConfigurationError("OPENAI_API_KEY");
  const config = getFactCheckConfig(environment);

  let preparedInput = input;
  let aiUsed = false;
  let activeModel = config.classifierModel;
  if (input.inputType === "link") {
    try {
      const linkedPage = await retrieveLinkedPage(input.url);
      const reducedPage = extractCandidateText(linkedPage.text, telemetryContext?.maxInputChars || config.maxInputChars);
      preparedInput = { ...input, linkedPageContent: reducedPage.text };
      logServerInfo("fact_check.link_retrieved", { contentLength: reducedPage.text.length, truncated: reducedPage.truncated });
    } catch (error) {
      logServerInfo("fact_check.link_unavailable", { errorName: error instanceof Error ? error.name : "UnknownError" });
      if (!input.text) {
        throw new FactCheckAnalysisError("We could not read this linked page. Add the post text or a screenshot and try again. This attempt was not charged.", false, "LINK_CONTENT_UNAVAILABLE");
      }
    }
  }

  try {
    const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
    const markAiUsed = () => { aiUsed = true; };
    const classification = await classifyInput(openai, config.classifierModel, preparedInput, deadline, config.maxOutputTokens, markAiUsed);
    if (!classification.value.factCheckable) {
      const result = buildNonFactualResult(classification.value);
      await logCompletion({ sourceInput: input, startedAt, classification, result, route: "cheap", context: telemetryContext });
      return result;
    }

    const factualClaimCount = classification.value.claims.filter((claim) => claim.factCheckable).length;
    const route = selectResearchRoute({ category: classification.value.category, factualClaimCount }, config);
    if (!config.webSearchEnabled) {
      const result = buildUnsearchedFactualResult(classification.value);
      await logCompletion({ sourceInput: input, startedAt, classification, result, route: "cheap", context: telemetryContext });
      return result;
    }
    activeModel = route.model;
    const research = await researchClaims(openai, route.model, classification.value, route, deadline, config.maxOutputTokens, markAiUsed);
    const candidate = buildTrustedFactCheck(classification.value, research.value, research.retrievedSources);
    const validated = factCheckResultSchema.safeParse(candidate);
    if (!validated.success) throw new Error("The trust engine produced an invalid result.");
    await logCompletion({ sourceInput: input, startedAt, classification, research, result: validated.data, route: route.route, context: telemetryContext });
    return validated.data;
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof FactCheckAnalysisError) throw error;
    if (aiUsed) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      await recordAiUsage({
        factCheckLogId: telemetryContext?.factCheckLogId,
        userId: telemetryContext?.userId,
        requestId: telemetryContext?.requestId,
        model: activeModel,
        requestType: "fact_check",
        stage: "analysis",
        status: "failed",
        latencyMs: Date.now() - startedAt,
        timedOut,
        errorCode: timedOut ? "AI_TIMEOUT" : "ANALYSIS_FAILED",
        metadata: { plan: telemetryContext?.plan || "unknown" },
      });
      await recordError({ error, type: "ai_error", severity: "error", endpoint: "/api/fact-check", userId: telemetryContext?.userId, requestId: telemetryContext?.requestId, metadata: { stage: "analysis", timedOut, model: activeModel } });
    }
    throw new FactCheckAnalysisError("We could not complete this check after AI analysis started. This attempt counted toward your plan.", aiUsed, "ANALYSIS_FAILED");
  }
}
