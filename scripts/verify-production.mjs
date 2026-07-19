const required = {
  NEXT_PUBLIC_APP_URL: {
    hint: "expected a public HTTPS origin such as https://insightaiforall.com",
    validate: (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname) && url.origin === value.replace(/\/$/, "");
      } catch {
        return false;
      }
    },
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    hint: "expected the HTTPS Supabase project URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
      } catch {
        return false;
      }
    },
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: { hint: "expected sb_publishable_...", validate: (value) => value.startsWith("sb_publishable_") || value.startsWith("eyJ") },
  SUPABASE_SERVICE_ROLE_KEY: { hint: "expected sb_secret_...", validate: (value) => value.startsWith("sb_secret_") || value.startsWith("eyJ") },
  ADMIN_CRON_SECRET: { hint: "expected at least 32 random characters", validate: (value) => value.length >= 32 },
  OPENAI_API_KEY: { hint: "expected sk-...", validate: (value) => value.startsWith("sk-") },
  OPENAI_MODEL: { hint: "expected a model name", validate: (value) => value.length > 0 },
  STRIPE_SECRET_KEY: { hint: "expected sk_test_... or sk_live_...", validate: (value) => /^sk_(test|live)_/.test(value) },
  STRIPE_WEBHOOK_SECRET: { hint: "expected whsec_...", validate: (value) => value.startsWith("whsec_") },
};

const optional = {
  ALERT_WEBHOOK_URL: { hint: "expected an HTTPS URL when set", validate: (value) => !value || value.startsWith("https://") },
  ALERT_WEBHOOK_SECRET: { hint: "expected at least 24 characters when set", validate: (value) => !value || value.length >= 24 },
  STRIPE_STARTER_PRICE_ID: { hint: "expected legacy price_... when set", validate: (value) => !value || value.startsWith("price_") },
  STRIPE_STARTER_399_PRICE_ID: { hint: "expected price_... when set", validate: (value) => !value || value.startsWith("price_") },
  STRIPE_PRO_PRICE_ID: { hint: "expected price_... when set", validate: (value) => !value || value.startsWith("price_") },
  STRIPE_MAX_PRICE_ID: { hint: "expected price_... when set", validate: (value) => !value || value.startsWith("price_") },
};

const failures = [...Object.entries(required), ...Object.entries(optional)]
  .filter(([name, setting]) => !setting.validate((process.env[name] || "").trim()))
  .map(([name, setting]) => `${name} (${setting.hint})`);

if (failures.length > 0) {
  console.error(`Production configuration is incomplete or invalid:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Production configuration passed all required format checks.");