import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getAdminUser, getAdminOverview, evaluateAdminAlerts, recordAdminAudit, recordApiRequest } = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  getAdminOverview: vi.fn(),
  evaluateAdminAlerts: vi.fn(),
  recordAdminAudit: vi.fn(),
  recordApiRequest: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminUser }));
vi.mock("@/lib/admin/data", () => ({ getAdminOverview }));
vi.mock("@/lib/admin/alerts", () => ({ evaluateAdminAlerts }));
vi.mock("@/lib/telemetry/server", () => ({ recordAdminAudit, recordApiRequest, recordError: vi.fn() }));

import { GET as getHealth } from "./health/route";
import { GET as getExport } from "./export/route";
import { POST as evaluateAlerts } from "./alerts/evaluate/route";

describe("admin API authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects health access without a database admin role", async () => {
    getAdminUser.mockResolvedValue(null);
    const response = await getHealth(new NextRequest("https://insight.example/api/admin/health"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(getAdminOverview).not.toHaveBeenCalled();
  });

  it("rejects exports without a database admin role", async () => {
    getAdminUser.mockResolvedValue(null);
    const response = await getExport(new NextRequest("https://insight.example/api/admin/export?type=telemetry"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it("rejects scheduled evaluation with the wrong bearer secret", async () => {
    vi.stubEnv("ADMIN_CRON_SECRET", "a".repeat(32));
    const response = await evaluateAlerts(new NextRequest("https://insight.example/api/admin/alerts/evaluate", { method: "POST", headers: { authorization: `Bearer ${"b".repeat(32)}` } }));
    expect(response.status).toBe(401);
    expect(evaluateAdminAlerts).not.toHaveBeenCalled();
  });

  it("runs scheduled evaluation with the configured bearer secret", async () => {
    vi.stubEnv("ADMIN_CRON_SECRET", "a".repeat(32));
    evaluateAdminAlerts.mockResolvedValue([]);
    const response = await evaluateAlerts(new NextRequest("https://insight.example/api/admin/alerts/evaluate", { method: "POST", headers: { authorization: `Bearer ${"a".repeat(32)}` } }));
    expect(response.status).toBe(200);
    expect(evaluateAdminAlerts).toHaveBeenCalledOnce();
  });
});