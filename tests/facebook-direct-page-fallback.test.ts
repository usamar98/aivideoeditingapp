import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { FacebookGrantError, facebookGrantSchema, loadFacebookGrant, verifyFacebookPage } from "@/lib/social/facebook";
import { logFacebookOAuthResult } from "@/lib/social/facebook-oauth-diagnostics";
import { seal, unseal } from "@/lib/social/crypto";

const fetcher = vi.fn(), pageDebug = vi.fn(), pageIdentity = vi.fn();
const json = (data: unknown, status = 200) => Response.json(data, { status });
const userToken = "private-user-token", pageToken = (id: string) => `private-page-token-${id}`;
let scopes: { scope: string; target_ids?: string[] }[], userPatch: Record<string, unknown>;
const metadata = (patch: Record<string, unknown> = {}) => ({
  app_id: "123", user_id: "111", type: "USER", is_valid: true, expires_at: 0,
  data_access_expires_at: Math.floor(Date.now() / 1000) + 3600, scopes: [...FACEBOOK_SCOPES], granular_scopes: scopes, ...patch,
});

beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "private-app-secret");
  vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v26.0");
  vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://createaivideos.app/api/social/facebook/callback");
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  scopes = FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: ["222"] })); userPatch = {};
  fetcher.mockReset(); pageDebug.mockReset(); pageIdentity.mockReset();
  pageDebug.mockImplementation((id: string) => json({ data: metadata({ type: "PAGE", profile_id: id }) }));
  pageIdentity.mockImplementation((id: string) => json({ id, name: `Verified private Page ${id}` }));
  fetcher.mockImplementation(async (raw: string, options: RequestInit) => {
    const url = new URL(raw), endpoint = url.pathname.split("/").at(-1)!;
    const bearer = new Headers(options.headers).get("Authorization")!;
    if (endpoint === "me") return bearer === `Bearer ${userToken}` ? json({ id: "111" }) : pageIdentity(bearer.replace("Bearer private-page-token-", ""));
    if (endpoint === "permissions") return json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) });
    if (endpoint === "accounts") return json({ data: [] });
    if (endpoint === "debug_token") {
      const input = url.searchParams.get("input_token")!;
      return input === userToken ? json({ data: metadata(userPatch) }) : pageDebug(input.replace("private-page-token-", ""));
    }
    if (url.searchParams.get("fields") === "id") return json({ id: endpoint });
    if (url.searchParams.get("fields") === "id,access_token") return json({ id: endpoint, access_token: pageToken(endpoint) });
    throw new Error("Unexpected provider request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("verified direct-Page connection fallback", () => {
  it("recovers an explicitly authorized Page without inventing tasks, and preserves provenance in the encrypted grant", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { diagnostics, ...grant } = await loadFacebookGrant(userToken);
    expect(grant.pages).toEqual([{ id: "222", name: "Verified private Page 222", access_token: pageToken("222"), tasks: [], authorization: "direct_page_token" }]);
    expect(diagnostics).toMatchObject({ returnedPages: 0, eligiblePages: 1, taskCounts: {}, pagesWithoutTasks: 0,
      directPageLookup: { attemptedPages: 1, verifiedPages: 1, rejectedPages: 0, unavailablePages: 0 },
      pageGrants: { pageTokenProbe: { tokensReturned: 1 } },
    });
    const context = `facebook-grant:${randomUUID()}`, encrypted = seal(JSON.stringify(grant), context);
    expect(encrypted).not.toContain("private-");
    const restored = facebookGrantSchema.parse(JSON.parse(unseal(encrypted, context)));
    expect(restored).toEqual(grant);
    expect(restored.pages[0].tasks).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(timeout.mock.calls.slice(3)).toEqual(Array(5).fill([10_000]));
    const [debugUrl, debugOptions] = fetcher.mock.calls[6];
    expect(new URL(debugUrl).searchParams.get("input_token")).toBe(pageToken("222"));
    expect(debugOptions.headers.Authorization).toBe("Bearer 123|private-app-secret");
    const [identityUrl, identityOptions] = fetcher.mock.calls[7];
    expect(new URL(identityUrl).pathname).toBe("/v26.0/me");
    expect(identityOptions.headers.Authorization).toBe(`Bearer ${pageToken("222")}`);
    for (const [raw, options] of fetcher.mock.calls) {
      const url = new URL(raw);
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(url.searchParams.has("appsecret_proof")).toBe(true);
      expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    }
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logFacebookOAuthResult(randomUUID(), "choose_page", "complete", diagnostics);
    expect(JSON.stringify(JSON.parse(info.mock.calls[0][0]).diagnostics)).not.toMatch(/private-|222|111|123/);
    expect(JSON.parse(info.mock.calls[0][0]).diagnostics.directPageLookup.verifiedPages).toBe(1);
  });

  it.each([
    { type: "USER" }, { type: "APP" }, { type: undefined }, { profile_id: "333" }, { profile_id: undefined },
    { app_id: "999" }, { user_id: "999" }, { user_id: undefined }, { is_valid: false },
    { expires_at: 1 }, { data_access_expires_at: 1 }, { scopes: ["pages_show_list", "pages_read_engagement"] },
    { granular_scopes: [{ scope: "pages_manage_posts", target_ids: ["333"] }] },
  ])("never offers a credential with invalid/mismatched publishing metadata %#", async (patch) => {
    pageDebug.mockResolvedValue(json({ data: metadata({ type: "PAGE", profile_id: "222", ...patch }) }));
    const failure = await loadFacebookGrant(userToken).catch((error: unknown) => error) as FacebookGrantError;
    expect(failure).toBeInstanceOf(FacebookGrantError);
    expect(failure.outcome).toBe("page_token_access_unverified");
    expect(failure.diagnostics.directPageLookup).toEqual({ attemptedPages: 1, verifiedPages: 0, rejectedPages: 1, unavailablePages: 0 });
    expect(pageIdentity).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(JSON.stringify(failure)).not.toMatch(/private-|222|333/);
  });

  it.each([{ id: "333", name: "private-wrong-page" }, { id: "222" }, { id: "222", name: " " }])("requires a matching Page identity and name after metadata validation %#", async (payload) => {
    pageIdentity.mockResolvedValue(json(payload));
    await expect(loadFacebookGrant(userToken)).rejects.toMatchObject({ outcome: "page_token_access_unverified", diagnostics: {
      directPageLookup: { verifiedPages: 0, rejectedPages: 1 },
    } });
  });

  it.each([401, 403, 429, 503])("does not retry or offer credentials when validation returns HTTP %s", async (status) => {
    pageDebug.mockResolvedValue(json({ error: { code: status === 401 ? 190 : 10, message: "private-provider-error" } }, status));
    const failure = await loadFacebookGrant(userToken).catch((error: unknown) => error) as FacebookGrantError;
    expect(failure.outcome).toBe("page_token_access_unverified");
    expect(failure.diagnostics.directPageLookup?.verifiedPages).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(7); expect(pageIdentity).not.toHaveBeenCalled();
    expect(JSON.stringify(failure)).not.toContain("private-");
  });

  it("does not offer a credential on timeouts/transport failure or unreadable metadata", async () => {
    pageDebug.mockRejectedValueOnce(new Error("private-provider-error"));
    await expect(loadFacebookGrant(userToken)).rejects.toMatchObject({ outcome: "page_token_access_unverified", diagnostics: {
      directPageLookup: { unavailablePages: 1, verifiedPages: 0 },
    } });
    pageDebug.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(loadFacebookGrant(userToken)).rejects.toMatchObject({ outcome: "page_token_access_unverified" });
  });

  it("offers only verified Pages from the permission intersection, even with partial failures", async () => {
    scopes = FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: scope === "pages_manage_posts" ? ["222", "333"] : ["222", "333", "444"] }));
    pageDebug.mockImplementation((id: string) => json({ data: metadata({ type: "PAGE", profile_id: id, is_valid: id === "333" }) }));
    const grant = await loadFacebookGrant(userToken);
    expect(grant.pages.map((page) => page.id)).toEqual(["333"]);
    expect(grant.diagnostics).toMatchObject({ eligiblePages: 1, directPageLookup: { attemptedPages: 2, verifiedPages: 1, rejectedPages: 1 } });
    expect(fetcher.mock.calls.some(([raw]) => new URL(raw).pathname.endsWith("/444"))).toBe(false);
  });

  it("caps recovery at five authorized Pages and preserves target order", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => String(222 + i));
    scopes = FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: ids }));
    const grant = await loadFacebookGrant(userToken);
    expect(grant.pages.map((page) => page.id)).toEqual(ids.slice(0, 5));
    expect(grant.diagnostics).toMatchObject({ eligiblePages: 5, pageGrants: { truncated: true }, directPageLookup: { attemptedPages: 5, verifiedPages: 5 } });
    expect(fetcher).toHaveBeenCalledTimes(24);
  });

  it.each([
    { app_id: "999" }, { user_id: "999" }, { is_valid: false }, { expires_at: 1 },
    { granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope })) },
    { granular_scopes: FACEBOOK_SCOPES.map((scope, i) => ({ scope, target_ids: [String(222 + i)] })) },
  ])("does not query arbitrary Pages for invalid or non-enumerable user grants %#", async (patch) => {
    userPatch = patch;
    await expect(loadFacebookGrant(userToken)).rejects.toMatchObject({ outcome: "pages_not_returned" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(pageDebug).not.toHaveBeenCalled(); expect(pageIdentity).not.toHaveBeenCalled();
  });

  it("revalidates the same publishing credential when a pending Page is selected", async () => {
    expect(await verifyFacebookPage(pageToken("222"), "222", "111")).toEqual({ id: "222", name: "Verified private Page 222" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    pageDebug.mockResolvedValue(json({ data: metadata({ type: "PAGE", profile_id: "222", is_valid: false }) }));
    await expect(verifyFacebookPage(pageToken("222"), "222", "111")).rejects.toMatchObject({ code: "rejected" });
    expect(pageIdentity).toHaveBeenCalledTimes(1);
  });
});
