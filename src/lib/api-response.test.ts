import { describe, expect, it } from "vitest";
import { readFactCheckApiResponse } from "./api-response";

describe("readFactCheckApiResponse", () => {
  it("returns a JSON API payload", async () => {
    const response = Response.json({ code: "ANALYSIS_FAILED", error: "Try again." }, { status: 502 });

    await expect(readFactCheckApiResponse(response)).resolves.toEqual({
      code: "ANALYSIS_FAILED",
      error: "Try again.",
    });
  });

  it("reads a final payload after streamed heartbeats", async () => {
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n: heartbeat\n\n"));
        controller.enqueue(encoder.encode('data: {"factCheckId":"check-123"}\n\n'));
        controller.close();
      },
    }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });

    await expect(readFactCheckApiResponse(response)).resolves.toEqual({ factCheckId: "check-123" });
  });

  it("reads a structured error from a streamed response", async () => {
    const response = new Response('data: {"code":"ANALYSIS_FAILED","error":"Try again."}\n\n', {
      headers: { "content-type": "text/event-stream" },
    });

    await expect(readFactCheckApiResponse(response)).resolves.toEqual({
      code: "ANALYSIS_FAILED",
      error: "Try again.",
    });
  });

  it("does not expose a JSON parser error for an HTML response", async () => {
    const response = new Response("<!DOCTYPE html><title>Server error</title>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });

    await expect(readFactCheckApiResponse(response)).resolves.toEqual({
      code: "INVALID_RESPONSE",
      error: "The server returned an unexpected response. Please retry the check in a moment.",
    });
  });

  it("explains when an HTML response represents an expired session", async () => {
    const response = new Response("<!DOCTYPE html>", {
      status: 401,
      headers: { "content-type": "text/html" },
    });

    await expect(readFactCheckApiResponse(response)).resolves.toEqual({
      code: "UNAUTHORIZED",
      error: "Your session expired. Sign in again and retry the check.",
    });
  });
});