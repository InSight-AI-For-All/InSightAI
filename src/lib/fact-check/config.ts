import type { getServerEnvironment } from "@/lib/env";

export const DEFAULT_FACT_CHECK_MODEL = "gpt-5.4-nano";
export const CHEAP_CLASSIFIER_MODEL = "gpt-5-nano";
export const WEB_SEARCH_MODEL = "gpt-5.4-nano";
export const HIGH_RISK_MODEL = "gpt-5.4-mini";
export const MAX_INPUT_CHARS = 8_000;
export const MAX_OUTPUT_TOKENS = 3_000;

const highRiskCategories = new Set(["Politics", "Elections", "Health", "Finance", "Legal", "Breaking News", "Conflict / War"]);

function positiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string, fallback: boolean) {
  if (!value) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

export function getFactCheckConfig(environment: ReturnType<typeof getServerEnvironment>) {
  const defaultModel = environment.OPENAI_DEFAULT_FACT_CHECK_MODEL || DEFAULT_FACT_CHECK_MODEL;
  return {
    defaultModel,
    classifierModel: environment.OPENAI_CHEAP_CLASSIFIER_MODEL || environment.OPENAI_MODEL || CHEAP_CLASSIFIER_MODEL,
    webSearchModel: environment.OPENAI_WEB_SEARCH_MODEL || defaultModel || WEB_SEARCH_MODEL,
    highRiskModel: environment.OPENAI_HIGH_RISK_MODEL || HIGH_RISK_MODEL,
    maxInputChars: positiveInteger(environment.MAX_FACT_CHECK_INPUT_CHARS, MAX_INPUT_CHARS),
    maxOutputTokens: positiveInteger(environment.MAX_FACT_CHECK_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
    cacheTtlHours: positiveInteger(environment.FACT_CHECK_CACHE_TTL_HOURS, 168),
    routingEnabled: enabled(environment.ENABLE_MODEL_ROUTING, true),
    webSearchEnabled: enabled(environment.ENABLE_WEB_SEARCH, true),
  };
}

export function selectResearchRoute(input: { category: string; factualClaimCount: number }, config: ReturnType<typeof getFactCheckConfig>) {
  const highRisk = highRiskCategories.has(input.category) || input.factualClaimCount > 2;
  return {
    route: highRisk && config.routingEnabled ? "high_risk" as const : "default" as const,
    model: highRisk && config.routingEnabled ? config.highRiskModel : config.webSearchModel,
    maxSearchCalls: highRisk && config.routingEnabled ? 3 : 2,
    searchContextSize: highRisk && config.routingEnabled ? "medium" as const : "low" as const,
  };
}

export function cacheTtlHours(category: string, configuredHours: number) {
  return highRiskCategories.has(category) || category === "Technology" || category === "Sports"
    ? Math.min(configuredHours, 6)
    : configuredHours;
}

export function modelPricing(model: string) {
  if (model.startsWith("gpt-5.4-mini")) return { input: 0.75, cachedInput: 0.075, output: 4.5 };
  if (model.startsWith("gpt-5.4-nano")) return { input: 0.2, cachedInput: 0.02, output: 1.25 };
  if (model.startsWith("gpt-5-nano")) return { input: 0.05, cachedInput: 0.005, output: 0.4 };
  return { input: 1, cachedInput: 0.1, output: 6 };
}