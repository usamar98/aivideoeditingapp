import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { facebookGrantDiagnostics, facebookOAuthNotice, logFacebookOAuthResult, recordFacebookPageTasks } from "@/lib/social/facebook-oauth-diagnostics";

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
