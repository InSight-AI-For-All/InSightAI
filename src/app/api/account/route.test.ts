import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

describe("account request boundary", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://insight.example"));

  it("rejects cross-origin updates before authentication", async () => {
    const response = await PATCH(new Request("https://insight.example/api/account", {
      method: "PATCH",
      headers: { origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_ORIGIN" });
  });
});