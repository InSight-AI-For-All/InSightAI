import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719145525_fix_admin_unlimited_role_check.sql"),
  "utf8",
);

const protectedFunctions = [
  "public.reserve_fact_check(uuid, uuid)",
  "public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb)",
  "public.charge_fact_check_attempt(uuid, uuid)",
];

describe("admin unlimited usage migration", () => {
  it("bypasses plan quota only for the database admin role", () => {
    expect(migration).toContain("if profile_role = 'admin' then");
    expect(migration).toContain("'unlimited', true");
    expect(migration).not.toMatch(/raw_user_meta_data|user_metadata|auth\.jwt/i);
  });

  it("does not increment success or failed-attempt counters for admins", () => {
    expect(migration.match(/if profile_role <> 'admin' then/g)).toHaveLength(2);
  });

  it.each(protectedFunctions)("keeps %s service-role-only", (signature) => {
    expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated;`);
    expect(migration).toContain(`grant execute on function ${signature} to service_role;`);
  });
});
