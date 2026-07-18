import OpenAI from "openai";
import { ConfigurationError, getServerEnvironment } from "@/lib/env";
import { factCheckJsonSchema, factCheckSystemPrompt } from "@/lib/fact-check/prompt";
import {
  factCheckResultSchema,
  type FactCheckResult,
  type FactCheckSubmission,
} from "@/lib/fact-check/schema";

type AnalysisInput = FactCheckSubmission & { imageDataUrl?: string };

function describeInput(input: AnalysisInput) {
  if (input.inputType === "link") {
    return [
      "Input type: link",
      `Submitted URL (not retrieved): ${input.url}`,
      `User-provided context: ${input.text || "None provided"}`,
    ].join("\n");
  }

  if (input.inputType === "screenshot") {
    return [
      "Input type: screenshot",
      "Assess only what is visible in the attached image.",
      `User-provided context: ${input.text || "None provided"}`,
    ].join("\n");
  }

  return `Input type: text\nSubmitted claim:\n${input.text}`;
}

function parseResult(content: string | null): FactCheckResult | null {
  if (!content) return null;
  try {
    const parsed = factCheckResultSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function analyzeFactCheck(input: AnalysisInput) {
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) throw new ConfigurationError("OPENAI_API_KEY");

  const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
  const text = describeInput(input);
  const content: OpenAI.Chat.Completions.ChatCompletionUserMessageParam["content"] =
    input.imageDataUrl
      ? [
          { type: "text", text },
          { type: "image_url", image_url: { url: input.imageDataUrl, detail: "auto" } },
        ]
      : text;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await openai.chat.completions.create({
      model: environment.OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: factCheckSystemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fact_check_result",
          strict: true,
          schema: factCheckJsonSchema,
        },
      },
    });

    const result = parseResult(completion.choices[0]?.message.content ?? null);
    if (result) return result;
  }

  throw new Error("The AI provider returned an invalid structured response.");
}