export type FactCheckApiPayload = {
  error?: string;
  code?: string;
  factCheckId?: string;
};

export async function readFactCheckApiResponse(response: Response): Promise<FactCheckApiPayload> {
  const contentType = response.headers.get("content-type") || "";
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