import { describe, expect, it } from "vitest";
import { getPlan } from "./plans";

describe("plan limits", () => {
  it("defaults unknown plans to the five-check Free tier", () => {
    expect(getPlan("unexpected")).toMatchObject({ id: "free", limit: 5 });
  });

  it("sets Starter to 1,000 checks per month", () => {
    expect(getPlan("starter")).toMatchObject({
      id: "starter",
      limit: 1_000,
      cadence: "month",
    });
  });
});
