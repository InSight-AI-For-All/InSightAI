import { describe, expect, it } from "vitest";
import { getPaidPlanForStripePrice, getPlan, getStripePriceForPaidPlan } from "./plans";

describe("plan limits", () => {
  it("defaults unknown plans to the three-check Free tier", () => {
    expect(getPlan("unexpected")).toMatchObject({ id: "free", limit: 3, price: 0 });
  });

  it.each([
    ["starter", 20, 3.99],
    ["pro", 80, 12.99],
    ["max", 180, 24.99],
  ])("sets %s monthly limits and prices", (id, limit, price) => {
    expect(getPlan(id)).toMatchObject({ id, limit, price, cadence: "month" });
  });

  it("maps configured Stripe prices without trusting metadata", () => {
    const prices = {
      starter: "price_starter",
      legacyStarter: "price_old_starter",
      pro: "price_pro",
      max: "price_max",
    };
    expect(getPaidPlanForStripePrice("price_starter", prices)).toBe("starter");
    expect(getPaidPlanForStripePrice("price_old_starter", prices)).toBe("starter");
    expect(getPaidPlanForStripePrice("price_pro", prices)).toBe("pro");
    expect(getPaidPlanForStripePrice("price_max", prices)).toBe("max");
    expect(getPaidPlanForStripePrice("price_forged", prices)).toBeNull();
  });

  it("selects checkout prices only from the requested paid plan", () => {
    const prices = { starter: "price_starter", pro: "price_pro", max: "" };
    expect(getStripePriceForPaidPlan("starter", prices)).toBe("price_starter");
    expect(getStripePriceForPaidPlan("pro", prices)).toBe("price_pro");
    expect(getStripePriceForPaidPlan("max", prices)).toBeNull();
  });
});
