import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFactCheck } from "./provider";

const { createResponse, retrieveLinkedPage } = vi.hoisted(() => ({
  createResponse: vi.fn(),
  retrieveLinkedPage: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create: createResponse };
  },
}));

vi.mock("@/lib/fact-check/linked-page", () => ({ retrieveLinkedPage }));

const inaccessibleClassification = {
  category: "General",
  claimType: "Unverifiable",
  factCheckable: false,
  confidenceScore: 40,
  summary: "The linked page could not be accessed.",
  explanation: "The submitted page content could not be retrieved after searching the URL.",
  claims: [{
    text: "The linked page content could not be retrieved.",
    claimType: "Unverifiable",
    factCheckable: false,
  }],
};

describe("fact-check provider URL classification", () => {
  beforeEach(() => {
    createResponse.mockReset();
    retrieveLinkedPage.mockReset();
    retrieveLinkedPage.mockResolvedValue({
      url: "https://www.instagram.com/p/example/embed/captioned/",
      text: "The post claims a free public concert will be held at Piedmont Park.",
    });
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-nano");
  });

  it("requires web search to inspect a submitted URL before classification", async () => {
    createResponse.mockResolvedValueOnce({
      output_text: JSON.stringify(inaccessibleClassification),
      output: [{
        type: "web_search_call",
        action: {
          type: "search",
          sources: [{ url: "https://www.instagram.com/p/example/?utm_source=share" }],
        },
      }],
    });

    const result = await analyzeFactCheck({
      inputType: "link",
      text: "",
      url: "https://www.instagram.com/p/example/",
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });

    const request = createResponse.mock.calls[0][0];
    expect(request.tools).toEqual([{ type: "web_search", search_context_size: "medium" }]);
    expect(request.tool_choice).toBe("required");
    expect(request.max_tool_calls).toBe(3);
    expect(request.instructions).toContain("Search the exact submitted URL first");
    expect(request.input[0].content[0].text).toContain("https://www.instagram.com/p/example/");
    expect(request.input[0].content[0].text).toContain("free public concert");
    expect(request.input[0].content[0].text).toContain("untrusted data");
    expect(retrieveLinkedPage).toHaveBeenCalledWith("https://www.instagram.com/p/example/");
    expect(result.methodology).toMatchObject({ searchPerformed: true, sourceCount: 1 });
    expect(result.sources[0]?.url).toBe("https://www.instagram.com/p/example/");
    expect(result.summary).not.toContain("no accompanying textual claim");
  });

  it("does not search during classification for plain text", async () => {
    createResponse.mockResolvedValueOnce({
      output_text: JSON.stringify(inaccessibleClassification),
      output: [],
    });

    const result = await analyzeFactCheck({
      inputType: "text",
      text: "This statement is too vague to verify.",
      url: "",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });

    const request = createResponse.mock.calls[0][0];
    expect(request.tools).toBeUndefined();
    expect(request.tool_choice).toBeUndefined();
    expect(retrieveLinkedPage).not.toHaveBeenCalled();
    expect(result.methodology.searchPerformed).toBe(false);
  });
});