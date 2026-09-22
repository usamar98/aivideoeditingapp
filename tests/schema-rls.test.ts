import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/202609220001_initial_video_saas.sql"), "utf8").toLowerCase();
const tenantTables = ["workspaces", "workspace_members", "series", "characters", "episodes", "scenes", "assets", "generations", "credit_accounts", "credit_ledger"];

describe("access isolation migration", () => {
  it.each(tenantTables)("enables RLS for %s", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it("never grants authenticated users write access to the credit ledger", () => {
    expect(sql).toContain("grant select on public.credit_accounts, public.credit_ledger to authenticated");
    expect(sql).not.toContain("grant insert, update, delete on public.credit_ledger to authenticated");
  });

  it("uses atomic, idempotent credit and onboarding functions", () => {
    expect(sql).toContain("function public.apply_credit_purchase");
    expect(sql).toContain("on conflict (idempotency_key) do nothing");
    expect(sql).toContain("function private.ensure_personal_workspace");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("authorizes storage by workspace path and keeps generation status server-owned", () => {
    expect(sql).toContain("private.is_workspace_storage_path(name)");
    expect(sql).not.toContain("create policy generations_member_update");
    expect(sql).toContain("grant select, insert on public.generations to authenticated");
  });
});
