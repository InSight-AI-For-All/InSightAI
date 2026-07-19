import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260719165924_fact_check_cost_cache.sql"), "utf8");

describe("fact-check cache security", () => {
  it("keeps cached results service-role-only with RLS", () => {
    expect(migration).toContain("alter table public.fact_check_cache enable row level security;");
    expect(migration).toContain("revoke all on table public.fact_check_cache from public, anon, authenticated;");
    expect(migration).toContain("grant select, insert, update, delete on table public.fact_check_cache to service_role;");
    expect(migration).toContain("revoke all on function public.mark_fact_check_cache_hit(text) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.mark_fact_check_cache_hit(text) to service_role;");
  });

  it("stores no raw input or user identity fields", () => {
    expect(migration).not.toMatch(/\b(raw_text|submitted_url|screenshot_path|user_id|email|phone)\s+(?:text|uuid|jsonb)/i);
  });
});