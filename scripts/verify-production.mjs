const required = {
  NEXT_PUBLIC_APP_URL: (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {
      return false;
    }
  },
  NEXT_PUBLIC_SUPABASE_URL: (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {
      return false;
    }
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: (value) => value.startsWith("sb_publishable_") || value.startsWith("eyJ"),
  SUPABASE_SERVICE_ROLE_KEY: (value) => value.startsWith("sb_secret_") || value.startsWith("eyJ"),
  OPENAI_API_KEY: (value) => value.startsWith("sk-"),
  OPENAI_MODEL: (value) => value.length > 0,
  STRIPE_SECRET_KEY: (value) => /^sk_(test|live)_/.test(value),
  STRIPE_WEBHOOK_SECRET: (value) => value.startsWith("whsec_"),
  STRIPE_STARTER_PRICE_ID: (value) => value.startsWith("price_"),
};

const failures = Object.entries(required)
  .filter(([name, validate]) => !validate(process.env[name] || ""))
  .map(([name]) => name);

if (failures.length > 0) {
  console.error(`Production configuration is incomplete or invalid: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("Production configuration passed all required format checks.");