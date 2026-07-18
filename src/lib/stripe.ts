import Stripe from "stripe";
import { ConfigurationError, getServerEnvironment } from "@/lib/env";

let stripe: Stripe | null = null;

export function createStripeClient() {
  const secretKey = getServerEnvironment().STRIPE_SECRET_KEY;
  if (!secretKey) throw new ConfigurationError("STRIPE_SECRET_KEY");

  stripe ??= new Stripe(secretKey);
  return stripe;
}