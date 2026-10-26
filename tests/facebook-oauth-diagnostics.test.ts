import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { facebookGrantDiagnostics, facebookOAuthNotice, logFacebookOAuthResult, recordFacebookPageTasks } from "@/lib/social/facebook-oauth-diagnostics";
import { emptyFacebookPageGrantInspection } from "@/lib/social/facebook-page-grants";

afterEach(() => vi.restoreAllMocks());

describe("Facebook OAuth diagnostics privacy and notices", () => {
  it("reports scope status only for the three requested permissions", () => {
    const diagnostics = facebookGrantDiagnostics([
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_read_engagement", status: "declined" },
      { permission: "email", status: "private-email" },
    ]);
    expect(diagnostics.permissions).toEqual({ pages_show_list: "granted", pages_read_engagement: "declined", pages_manage_posts: "missing" });
    expect(facebookGrantDiagnostics([{ permission: "pages_show_list", status: "private-token" }]).permissions.pages_show_list).toBe("other");
  });
  it("logs fixed task labels and counts but no arbitrary provider fields or task text", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {}), reference = randomUUID();
    const diagnostics = facebookGrantDiagnostics(FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })));
    recordFacebookPageTasks(diagnostics, ["PROFILE_PLUS_FACEBOOK_ACCESS", "ANALYZE", "ANALYZE", "private-token\nlog injection"], false);
    recordFacebookPageTasks(diagnostics, [], false);
    // Defend the log boundary against future callers adding fields to the diagnostic object.
    Object.assign(diagnostics, { token: "private-user-token", pageId: "private-page-id", name: "private-page-name" });
    Object.assign(diagnostics.taskCounts, { "private-task-name": 1 });
    logFacebookOAuthResult(reference, "page_content_access_missing", "page_discovery", diagnostics);
    expect(JSON.parse(warning.mock.calls[0][0])).toEqual({ event: "facebook.oauth", reference,
      outcome: "page_content_access_missing", stage: "page_discovery", diagnostics: {
        permissions: diagnostics.permissions, returnedPages: 2, eligiblePages: 0, pagesWithoutTasks: 1,
        unrecognizedTasks: 1, taskCounts: { ANALYZE: 1, PROFILE_PLUS_FACEBOOK_ACCESS: 1 },
      } });
    expect(warning.mock.calls[0][0]).not.toContain("private-");
  });
  it("projects Page-specific grant diagnostics onto fixed labels and counts", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const diagnostics = facebookGrantDiagnostics([]);
    diagnostics.pageGrants = emptyFacebookPageGrantInspection("verified");
    diagnostics.pageGrants.scopeTargets.pages_show_list = { selection: "selected", count: 2 };
    Object.assign(diagnostics.pageGrants, { targets: ["private-page-id"], token: "private-token", error: "private-error" });
    Object.assign(diagnostics.pageGrants.scopeTargets, { "private-scope": { count: 1 } });
    Object.assign(diagnostics.pageGrants.scopeTargets.pages_show_list, { target_ids: ["private-page-id"] });
    Object.assign(diagnostics.pageGrants.scopeTargets.pages_manage_posts, { selection: "private-selection", count: -1 });
    Object.assign(diagnostics.pageGrants.pageTokenProbe, { attemptedTargets: 1, tokensReturned: 1, missingTokens: -1,
      rejectedTargets: Infinity, unavailableTargets: NaN, invalidResponses: "private-count", access_token: "private-page-token", pageId: "private-page-id" });
    logFacebookOAuthResult(randomUUID(), "pages_not_returned", "page_discovery", diagnostics);
    const logged = JSON.parse(warning.mock.calls[0][0]).diagnostics.pageGrants;
    expect(logged.scopeTargets.pages_show_list).toEqual({ selection: "selected", count: 2 });
    expect(logged.scopeTargets.pages_manage_posts).toEqual({ selection: "unknown", count: 0 });
    expect(logged.pageTokenProbe).toEqual({ attemptedTargets: 1, tokensReturned: 1, missingTokens: 0,
      rejectedTargets: 0, unavailableTargets: 0, invalidResponses: 0 });
    expect(warning.mock.calls[0][0]).not.toContain("private-");
  });
  it("shows distinct instructions and a validated support reference only for failures", () => {
    const reference = randomUUID();
    expect(facebookOAuthNotice("pages_not_returned", reference)).toContain("Facebook returned no Pages to the app's API");
    expect(facebookOAuthNotice("page_content_access_missing", reference)).toContain("publishing task recognized by this app");
    expect(facebookOAuthNotice("permissions_missing", reference)).toContain("did not grant all required Page permissions");
    expect(facebookOAuthNotice("pages_not_returned", reference)).toContain(`Support reference: ${reference}`);
    for (const outcome of ["choose_page", "denied"]) expect(facebookOAuthNotice(outcome, reference)).not.toContain(reference);
    for (const untrusted of ["private-token", `${reference}<script>`, "a".repeat(10000)]) expect(facebookOAuthNotice("connection_failed", untrusted)).not.toContain(untrusted);
    for (const outcome of [undefined, "unknown", "__proto__", "constructor", "toString"]) expect(facebookOAuthNotice(outcome, reference)).toBeNull();
    expect(facebookOAuthNotice("no_pages")).toContain("detailed connection result");
  });
});
