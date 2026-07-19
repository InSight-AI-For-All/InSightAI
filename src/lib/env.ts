export class ConfigurationError extends Error {
  constructor(setting: string) {
    super(`${setting} is not configured.`);
    this.name = "ConfigurationError";
  }
}

function getPublicSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export function hasSupabaseEnvironment() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getPublicSupabaseKey());
}

export function getPublicSupabaseEnvironment() {
  if (!hasSupabaseEnvironment()) return null;

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: getPublicSupabaseKey(),
  };
}

export function getServerEnvironment() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    ADMIN_CRON_SECRET: process.env.ADMIN_CRON_SECRET || "",
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || "",
    ALERT_WEBHOOK_SECRET: process.env.ALERT_WEBHOOK_SECRET || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5-nano",
    OPENAI_DEFAULT_FACT_CHECK_MODEL: process.env.OPENAI_DEFAULT_FACT_CHECK_MODEL || "",
    OPENAI_CHEAP_CLASSIFIER_MODEL: process.env.OPENAI_CHEAP_CLASSIFIER_MODEL || "",
    OPENAI_WEB_SEARCH_MODEL: process.env.OPENAI_WEB_SEARCH_MODEL || "",
    OPENAI_HIGH_RISK_MODEL: process.env.OPENAI_HIGH_RISK_MODEL || "",
    ENABLE_WEB_SEARCH: process.env.ENABLE_WEB_SEARCH || "",
    ENABLE_MODEL_ROUTING: process.env.ENABLE_MODEL_ROUTING || "",
    MAX_FACT_CHECK_INPUT_CHARS: process.env.MAX_FACT_CHECK_INPUT_CHARS || "",
    MAX_FACT_CHECK_OUTPUT_TOKENS: process.env.MAX_FACT_CHECK_OUTPUT_TOKENS || "",
    FACT_CHECK_CACHE_TTL_HOURS: process.env.FACT_CHECK_CACHE_TTL_HOURS || "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
    STRIPE_STARTER_PRICE_ID: process.env.STRIPE_STARTER_PRICE_ID || "",
    STRIPE_STARTER_399_PRICE_ID: process.env.STRIPE_STARTER_399_PRICE_ID || "",
    STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || "",
    STRIPE_MAX_PRICE_ID: process.env.STRIPE_MAX_PRICE_ID || "",
  };
}

export function getAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    return new URL(value).origin;
  } catch {
    throw new ConfigurationError("NEXT_PUBLIC_APP_URL");
  }
}