import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260719162256_multi_provider_auth_profiles.sql"), "utf8");

describe("multi-provider profile migration", () => {
  it("allows email-only, phone-only, and OAuth profiles", () => {
    expect(migration).toContain("alter column email drop not null");
    expect(migration).toContain("add column if not exists phone text");
    expect(migration).toContain("add column if not exists auth_provider text");
    expect(migration).toContain("add column if not exists auth_providers text[]");
  });

  it("creates profiles and usage counters idempotently", () => {
    expect(migration).toContain("on conflict (id) do update set");
    expect(migration).toContain("insert into public.usage_counters (user_id)");
    expect(migration).toContain("on conflict (user_id) do nothing");
  });

  it("syncs verified Supabase identity changes without exposing trigger functions", () => {
    expect(migration).toContain("after update of email, phone, raw_user_meta_data, raw_app_meta_data on auth.users");
    expect(migration).toContain("revoke all on function public.handle_new_user() from public, anon, authenticated;");
    expect(migration).toContain("revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;");
    expect(migration).not.toMatch(/verification_code|otp_code|password\s+text/i);
  });
});