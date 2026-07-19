import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser, rateLimit, recordTelemetryEvent } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimit: { count: 0 },
  recordTelemetryEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: (table: string) => table === "telemetry_events"
      ? { select: () => ({ eq: () => ({ gte: async () => ({ count: rateLimit.count }) }) }) }
      : { update: () => ({ eq: async () => ({ error: null }) }) },
  })),
}));
vi.mock("@/lib/telemetry/server", () => ({ recordTelemetryEvent, recordPerformanceMetric: vi.fn(), recordError: vi.fn() }));

import { POST } from "./route";

function request(body: Record<string, unknown>, origin = "https://insight.example") {
  return new NextRequest("https://insight.example/api/telemetry", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function referrerRequest(body: Record<string, unknown>, referrer: string) {
  return new NextRequest("https://insight.example/api/telemetry", {
    method: "POST",
    headers: { referer: referrer, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validEvent = { kind: "event", eventName: "page_viewed", sessionId: "8e432b9a-4945-4858-824a-dcbed1b940e6", metadata: { route: "/pricing" } };

describe("public telemetry ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.count = 0;
    getUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("rejects cross-origin events", async () => {
    const response = await POST(request(validEvent, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(recordTelemetryEvent).not.toHaveBeenCalled();
  });

  it("accepts exact-origin browser referrers when Origin is omitted", async () => {
    const response = await POST(referrerRequest(validEvent, "https://insight.example/login"));
    expect(response.status).toBe(204);
    expect(recordTelemetryEvent).toHaveBeenCalledOnce();
  });

  it("rejects cross-origin referrers when Origin is omitted", async () => {
    const response = await POST(referrerRequest(validEvent, "https://attacker.example/submit"));
    expect(response.status).toBe(403);
    expect(recordTelemetryEvent).not.toHaveBeenCalled();
  });

  it("rejects payloads outside the strict schema", async () => {
    const response = await POST(request({ ...validEvent, kind: undefined }));
    expect(response.status).toBe(400);
    expect(recordTelemetryEvent).not.toHaveBeenCalled();
  });

  it("limits each session to 120 events per minute", async () => {
    rateLimit.count = 120;
    const response = await POST(request(validEvent));
    expect(response.status).toBe(429);
    expect(recordTelemetryEvent).not.toHaveBeenCalled();
  });

  it("associates a valid same-origin event with the server user", async () => {
    const response = await POST(request(validEvent));
    expect(response.status).toBe(204);
    expect(recordTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "page_viewed", category: "navigation", userId: "user-123" }));
  });
});