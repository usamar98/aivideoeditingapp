import { describe, expect, it } from "vitest";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { inspectFacebookPageGrants } from "@/lib/social/facebook-page-grants";

const now = 1_800_000_000;
const data = {
  app_id: "123", user_id: "111", is_valid: true, expires_at: now + 3600,
  data_access_expires_at: now + 7200, scopes: [...FACEBOOK_SCOPES],
  granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: ["222", "333"] })),
};
const inspect = (patch: Record<string, unknown> = {}) => inspectFacebookPageGrants({ data: { ...data, ...patch } }, "123", "111", now);

describe("Facebook Page-specific authorization inspection (diagnostic only)", () => {
  it("intersects targets of all three Page permissions and deduplicates IDs", () => {
    const result = inspect({ granular_scopes: [
      { scope: "pages_show_list", target_ids: ["222", "333", "222"] },
      { scope: "pages_read_engagement", target_ids: ["333", "444"] },
      { scope: "pages_manage_posts", target_ids: ["333"] },
      { scope: "unrelated-permission", target_ids: ["555"] },
    ] });
    expect(result.targets).toEqual(["333"]);
    expect(result.summary).toMatchObject({ status: "verified", commonTargets: 1,
      scopeTargets: { pages_show_list: { selection: "selected", count: 2 } } });
    expect(JSON.stringify(result.summary)).not.toMatch(/222|333|444|555|unrelated/);
  });
  it("treats omitted/null targets on a present scope as all, without inventing Page IDs", () => {
    expect(inspect({ granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope })) }).targets).toEqual([]);
    const result = inspect({ granular_scopes: [
      { scope: "pages_show_list" }, { scope: "pages_read_engagement", target_ids: null },
      { scope: "pages_manage_posts", target_ids: [222, "333"] },
    ] });
    expect(result.targets).toEqual(["222", "333"]);
    expect(result.summary.scopeTargets.pages_read_engagement.selection).toBe("all");
  });
  it("keeps explicit empty selections and disjoint Page grants empty", () => {
    expect(inspect({ granular_scopes: FACEBOOK_SCOPES.map((scope, i) => ({ scope, target_ids: [String(i + 200)] })) }).targets).toEqual([]);
    const result = inspect({ granular_scopes: FACEBOOK_SCOPES.map((scope, i) => ({ scope, target_ids: i === 0 ? [] : ["222"] })) });
    expect(result.targets).toEqual([]);
    expect(result.summary.scopeTargets.pages_show_list).toEqual({ selection: "selected", count: 0 });
  });
  it("never interprets missing or duplicate granular scope entries as unrestricted access", () => {
    for (const granular_scopes of [undefined, [], data.granular_scopes.slice(1), [...data.granular_scopes, data.granular_scopes[0]]]) {
      const result = inspect({ granular_scopes });
      expect(result.targets).toEqual([]);
      expect(result.summary.scopeTargets.pages_show_list.selection).toBe("unknown");
    }
  });
  it.each([
    { is_valid: false }, { app_id: "456" }, { user_id: "999" },
    { expires_at: now }, { data_access_expires_at: now - 1 }, { scopes: ["pages_show_list"] },
  ])("does not inspect Page targets for invalid token metadata: %j", (patch) => {
    expect(inspect(patch)).toMatchObject({ summary: { status: "invalid", commonTargets: 0 }, targets: [] });
  });
  it("accepts zero expiry as non-expiring without ignoring explicit expiration", () => {
    expect(inspect({ expires_at: 0, data_access_expires_at: 0 }).summary.status).toBe("verified");
  });
  it.each(["../me", "https://attacker.test", "222?fields=access_token", Number.MAX_SAFE_INTEGER + 1, -1])("rejects unsafe target ID %j", (id) => {
    expect(inspect({ granular_scopes: [{ scope: "pages_show_list", target_ids: [id] }] })).toMatchObject({ summary: { status: "malformed" }, targets: [] });
  });
  it("bounds metadata and never returns arbitrary provider errors", () => {
    for (const payload of [null, { error: { message: "private-token" } }, { data: { ...data, granular_scopes: [{ scope: "pages_show_list", target_ids: Array(5001).fill("222") }] } }]) {
      const result = inspectFacebookPageGrants(payload, "123", "111", now);
      expect(result.summary.status).toBe("malformed");
      expect(JSON.stringify(result)).not.toContain("private-token");
    }
  });
});
