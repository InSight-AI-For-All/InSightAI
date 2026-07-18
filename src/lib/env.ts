export class ConfigurationError extends Error {
  constructor(setting: string) {
    super(`${setting} is not configured.`);
    this.name = "ConfigurationError";
  }
}

export function hasSupabaseEnvironment() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getPublicSupabaseEnvironment() {
  if (!hasSupabaseEnvironment()) return null;

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function getServerEnvironment() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
    STRIPE_STARTER_PRICE_ID: process.env.STRIPE_STARTER_PRICE_ID || "",
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