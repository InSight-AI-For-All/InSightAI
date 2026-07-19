export type FactCheckApiPayload = {
  error?: string;
  code?: string;
  factCheckId?: string;
};

async function readEventStream(response: Response): Promise<FactCheckApiPayload | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const data = event.split("\n").find((line) => line.startsWith("data:"));
      if (!data) continue;
      try {
        return JSON.parse(data.slice(5).trim()) as FactCheckApiPayload;
      } catch {
        return null;
      }
    }

    if (done) return null;
  }
}

export async function readFactCheckApiResponse(response: Response): Promise<FactCheckApiPayload> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const payload = await readEventStream(response);
    if (payload) return payload;
  }
  if (contentType.includes("application/json")) {
    try {
      return await response.json() as FactCheckApiPayload;
    } catch {
      // Fall through to the stable error below when an upstream response is truncated.
    }
  }

  if (response.status === 401) {
    return { code: "UNAUTHORIZED", error: "Your session expired. Sign in again and retry the check." };
  }

  return {
    code: "INVALID_RESPONSE",
    error: "The server returned an unexpected response. Please retry the check in a moment.",
  };
}