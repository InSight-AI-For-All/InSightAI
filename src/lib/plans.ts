export const paidPlanIds = ["starter", "pro", "max"] as const;
export type PaidPlanId = (typeof paidPlanIds)[number];
export type PlanId = "free" | PaidPlanId;

const plans = {
  free: {
    id: "free",
    name: "Free",
    limit: 3,
    cadence: "lifetime",
    price: 0,
  },
  starter: {
    id: "starter",
    name: "Starter",
    limit: 20,
    cadence: "month",
    price: 3.99,
  },
  pro: {
    id: "pro",
    name: "Pro",
    limit: 80,
    cadence: "month",
    price: 12.99,
  },
  max: {
    id: "max",
    name: "Max",
    limit: 180,
    cadence: "month",
    price: 24.99,
  },
} as const;

export function getPlan(plan: string | null | undefined) {
  return plan === "starter" || plan === "pro" || plan === "max" ? plans[plan] : plans.free;
}

export function isPaidPlanId(value: string): value is PaidPlanId {
  return paidPlanIds.some((plan) => plan === value);
}

export function getPaidPlanForStripePrice(
  priceId: string,
  prices: Record<PaidPlanId, string> & { legacyStarter?: string },
): PaidPlanId | null {
  if (priceId === prices.starter || (prices.legacyStarter && priceId === prices.legacyStarter)) return "starter";
  if (priceId === prices.pro) return "pro";
  if (priceId === prices.max) return "max";
  return null;
}

export function getStripePriceForPaidPlan(plan: PaidPlanId, prices: Record<PaidPlanId, string>) {
  return prices[plan] || null;
}