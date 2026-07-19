import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260719134156_observability_admin_portal.sql"), "utf8");
const protectedTables = ["telemetry_events", "error_logs", "api_logs", "fact_check_logs", "ai_usage_logs", "web_search_logs", "billing_events", "performance_metrics", "admin_audit_logs", "alert_rules", "alert_incidents"];

describe("observability migration security", () => {
  it.each(protectedTables)("enables RLS for %s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security;`);
  });

  it("revokes ordinary roles and grants only the service role", () => {
    for (const table of protectedTables) {
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      expect(migration).toContain(`grant select, insert, update, delete on table public.${table} to service_role;`);
    }
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all).*telemetry_events.*authenticated/i);
  });
});