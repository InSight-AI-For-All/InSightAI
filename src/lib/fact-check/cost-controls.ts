import { createHash } from "node:crypto";
import type { FactCheckSubmission, FactCheckResult } from "@/lib/fact-check/schema";
import { normalizeSourceUrl } from "@/lib/fact-check/trust-engine";

const factualSignal = /\b(is|are|was|were|has|have|will|causes?|increases?|decreases?|proves?|found|reported|according|percent|million|billion)\b|\d/i;

export function inputLimitForPlan(plan: string, configuredMaximum: number) {
  if (plan === "free") return Math.min(configuredMaximum, 4_000);
  return configuredMaximum;
}

export function extractCandidateText(value: string, maximumCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumCharacters) return { text: normalized, truncated: false };
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const selected = sentences
    .map((text, index) => ({ text: text.trim(), index, score: factualSignal.test(text) ? 2 : 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 10)
    .sort((left, right) => left.index - right.index);
  let output = "";
  for (const sentence of selected) {
    const candidate = output ? `${output} ${sentence.text}` : sentence.text;
    if (candidate.length > maximumCharacters) continue;
    output = candidate;
  }
  if (!output) output = normalized.slice(0, maximumCharacters);
  return { text: `${output}\n[Long input reduced to candidate factual claims.]`, truncated: true };
}

export function normalizedContentHash(submission: FactCheckSubmission, imageBytes?: Buffer) {
  let content: string;
  if (submission.inputType === "link") {
    content = normalizeSourceUrl(submission.url) || submission.url.trim();
  } else if (submission.inputType === "screenshot" && imageBytes) {
    content = `${createHash("sha256").update(imageBytes).digest("hex")}|${submission.text.trim().toLowerCase()}`;
  } else {
    content = submission.text.trim().toLowerCase().replace(/\s+/g, " ");
  }
  return createHash("sha256").update(`${submission.inputType}|${content}`).digest("hex");
}

export function isReusableCachedResult(value: unknown): value is FactCheckResult {
  return Boolean(value && typeof value === "object");
}