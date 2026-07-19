import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFactCheck, FactCheckAnalysisError } from "./provider";

const { createResponse, retrieveLinkedPage } = vi.hoisted(() => ({ createResponse: vi.fn(), retrieveLinkedPage: vi.fn() }));
vi.mock("openai", () => ({ default: class OpenAI { responses = { create: createResponse }; } }));
vi.mock("@/lib/fact-check/linked-page", () => ({ retrieveLinkedPage }));

const opinionClassification = {
  category: "Opinion",
  claimType: "Opinion / Subjective",
  factCheckable: false,
  confidenceScore: 90,
  summary: "This is an opinion.",
  explanation: "The statement expresses a preference.",
  claims: [{ text: "This is the best movie.", claimType: "Opinion / Subjective", factCheckable: false }],
};

function factualClassification(category = "General") {
  return {
    category,
    claimType: "Factual Claim",
    factCheckable: true,
    confidenceScore: 90,
    summary: "A factual claim requires verification.",
    explanation: "External evidence can support or contradict it.",
    claims: [{ text: "The city opened the park in 2020.", claimType: "Factual Claim", factCheckable: true }],
  };
}

const sourceA = "https://city.gov/park";
const sourceB = "https://reuters.com/world/park";
const research = {
  category: "General",
  claimType: "Factual Claim",
  factCheckable: true,
  summary: "The claim is supported.",
  claims: [{
    text: "The city opened the park in 2020.",
    claimType: "Factual Claim",
    factCheckable: true,
    reasoning: "Two independent sources report the opening.",
    evidence: [
      { sourceUrl: sourceA, stance: "supports", evidenceSummary: "The city records the 2020 opening." },
      { sourceUrl: sourceB, stance: "supports", evidenceSummary: "Reuters reported the opening." },
    ],
  }],
  analysis: "Available evidence supports the claim.",
  evidenceAssessment: "Two independent sources agree.",
  limitations: "Historical records can be corrected.",
  uncertainties: "No material uncertainty was found.",
  recommendedAction: "Safe to share with source context.",
  disclaimer: "AI-generated analysis may be wrong and is not final authority.",
};

function researchResponse() {
  return {
    output_text: JSON.stringify(research),
    output: [
      { type: "web_search_call", action: { type: "search", sources: [{ url: sourceA }, { url: sourceB }] } },
      { type: "message", content: [{ type: "output_text", annotations: [
        { type: "url_citation", url: sourceA, title: "City record" },
        { type: "url_citation", url: sourceB, title: "Reuters report" },
      ] }] },
    ],
  };
}

function submission(inputType: "text" | "link" | "screenshot" = "text") {
  return {
    inputType,
    text: inputType === "link" ? "" : "The city opened the park in 2020.",
    url: inputType === "link" ? "https://example.com/post" : "",
    idempotencyKey: crypto.randomUUID(),
    ...(inputType === "screenshot" ? { imageDataUrl: "data:image/png;base64,abc" } : {}),
  };
}

describe("cost-routed fact-check provider", () => {
  beforeEach(() => {
    createResponse.mockReset();
    retrieveLinkedPage.mockReset();
    retrieveLinkedPage.mockResolvedValue({ url: "https://example.com/post", text: "The city opened the park in 2020." });
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-nano");
    vi.stubEnv("OPENAI_DEFAULT_FACT_CHECK_MODEL", "");
    vi.stubEnv("OPENAI_WEB_SEARCH_MODEL", "");
    vi.stubEnv("OPENAI_HIGH_RISK_MODEL", "");
    vi.stubEnv("ENABLE_WEB_SEARCH", "true");
    vi.stubEnv("ENABLE_MODEL_ROUTING", "true");
  });

  it("classifies extracted link text without paying for web search", async () => {
    createResponse.mockResolvedValueOnce({ output_text: JSON.stringify(opinionClassification), output: [] });
    const result = await analyzeFactCheck(submission("link"));
    const request = createResponse.mock.calls[0][0];
    expect(request.tools).toBeUndefined();
    expect(request.input[0].content[0].text).toContain("page_text_untrusted");
    expect(request.input[0].content[0].text).toContain("opened the park");
    expect(retrieveLinkedPage).toHaveBeenCalledOnce();
    expect(result.methodology.searchPerformed).toBe(false);
  });

  it("skips research and web search for opinions and memes", async () => {
    createResponse.mockResolvedValueOnce({ output_text: JSON.stringify(opinionClassification), output: [] });
    const result = await analyzeFactCheck(submission());
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(result.verdict).toBe("Opinion / Not Fact Checkable");
  });

  it("routes a normal factual claim to the cheapest documented search model", async () => {
    createResponse
      .mockResolvedValueOnce({ output_text: JSON.stringify(factualClassification()), output: [] })
      .mockResolvedValueOnce(researchResponse());
    const result = await analyzeFactCheck(submission());
    expect(createResponse.mock.calls[0][0].model).toBe("gpt-5-nano");
    expect(createResponse.mock.calls[1][0]).toMatchObject({ model: "gpt-5.4-nano", tool_choice: "required", max_tool_calls: 2 });
    expect(createResponse.mock.calls[1][0].tools).toEqual([{ type: "web_search", search_context_size: "low" }]);
    expect(result.methodology).toMatchObject({ searchPerformed: true, independentSourceCount: 2 });
  });

  it("routes high-risk claims to the stronger model only for research", async () => {
    createResponse
      .mockResolvedValueOnce({ output_text: JSON.stringify(factualClassification("Health")), output: [] })
      .mockResolvedValueOnce({ ...researchResponse(), output_text: JSON.stringify({ ...research, category: "Health" }) });
    await analyzeFactCheck(submission());
    expect(createResponse.mock.calls[0][0].model).toBe("gpt-5-nano");
    expect(createResponse.mock.calls[1][0]).toMatchObject({ model: "gpt-5.4-mini", max_tool_calls: 3 });
  });

  it("sends a screenshot once at low detail and never repeats it during research", async () => {
    createResponse
      .mockResolvedValueOnce({ output_text: JSON.stringify(factualClassification()), output: [] })
      .mockResolvedValueOnce(researchResponse());
    await analyzeFactCheck(submission("screenshot"));
    expect(createResponse.mock.calls[0][0].input[0].content[1]).toMatchObject({ type: "input_image", detail: "low" });
    expect(typeof createResponse.mock.calls[1][0].input).toBe("string");
    expect(createResponse.mock.calls[1][0].input).not.toContain("data:image");
  });

  it("repairs malformed classification JSON once with a short no-tool request", async () => {
    createResponse
      .mockResolvedValueOnce({ output_text: "{bad json", output: [] })
      .mockResolvedValueOnce({ output_text: JSON.stringify(opinionClassification), output: [] });
    await analyzeFactCheck(submission());
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(createResponse.mock.calls[1][0].instructions).toContain("Repair");
    expect(createResponse.mock.calls[1][0].tools).toBeUndefined();
    expect(createResponse.mock.calls[1][0].input).toBe("{bad json");
  });

  it("does not call OpenAI when a contextless linked page cannot be extracted", async () => {
    retrieveLinkedPage.mockRejectedValueOnce(new Error("Blocked"));
    await expect(analyzeFactCheck(submission("link"))).rejects.toMatchObject({ aiUsed: false, code: "LINK_CONTENT_UNAVAILABLE" } satisfies Partial<FactCheckAnalysisError>);
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("marks provider failures after a request as chargeable", async () => {
    createResponse.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(analyzeFactCheck(submission())).rejects.toMatchObject({ aiUsed: true, code: "ANALYSIS_FAILED" } satisfies Partial<FactCheckAnalysisError>);
  });
});
