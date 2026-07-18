const plans = {
  free: {
    id: "free",
    name: "Free",
    limit: 5,
    cadence: "lifetime",
  },
  starter: {
    id: "starter",
    name: "Starter",
    limit: 1_000,
    cadence: "month",
  },
} as const;

export function getPlan(plan: string | null | undefined) {
  return plan === "starter" ? plans.starter : plans.free;
}