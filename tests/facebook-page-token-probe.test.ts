import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { FacebookGrantError, loadFacebookGrant } from "@/lib/social/facebook";
import { logFacebookOAuthResult } from "@/lib/social/facebook-oauth-diagnostics";

const fetcher = vi.fn(), tokenReply = vi.fn(), identityReply = vi.fn();
const json = (data: unknown, status = 200) => Response.json(data, { status });
const defaults = { attemptedTargets: 1, tokensReturned: 0, missingTokens: 0, rejectedTargets: 0, unavailableTargets: 0, invalidResponses: 0 };
let targets: string[] | undefined;

beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_ID", "123");
  vi.stubEnv("FACEBOOK_APP_SECRET", "private-app-secret");
  vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v26.0");
  vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://createaivideos.app/api/social/facebook/callback");
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  targets = ["222"];
  fetcher.mockReset(); tokenReply.mockReset(); identityReply.mockReset();
  identityReply.mockImplementation((id: string) => json({ id }));
  tokenReply.mockImplementation((id: string) => json({ id, access_token: "private-page-token" }));
  fetcher.mockImplementation(async (raw: string) => {
    const url = new URL(raw), endpoint = url.pathname.split("/").at(-1);
    if (endpoint === "me") return json({ id: "111" });
    if (endpoint === "permissions") return json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) });
    if (endpoint === "accounts") return json({ data: [] });
    if (endpoint === "debug_token") return json({ data: {
      app_id: "123", user_id: "111", is_valid: true, expires_at: 0, scopes: [...FACEBOOK_SCOPES],
      granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: targets })),
    } });
    if (url.searchParams.get("fields") === "id") return identityReply(endpoint);
    if (url.searchParams.get("fields") === "id,access_token") return tokenReply(endpoint);
    throw new Error("Unexpected diagnostic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function failure() {
  const result = await loadFacebookGrant("private-user-token").catch((error: unknown) => error);
  expect(result).toBeInstanceOf(FacebookGrantError);
  const error = result as FacebookGrantError;
  expect(error.outcome).toBe("pages_not_returned");
  expect(error.diagnostics.returnedPages).toBe(0);
  expect(error.diagnostics.eligiblePages).toBe(0);
  return error;
}

describe("diagnostic-only direct Page-token availability", () => {
  it("requests only an authorized, readable Page, with a short deadline and no token in its URL or result", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const error = await failure();
    expect(error.diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, tokensReturned: 1 });
    expect(error).not.toHaveProperty("pages");
    expect(timeout.mock.calls.at(-1)).toEqual([10_000]);
    const [raw, options] = fetcher.mock.calls.at(-1)!;
    const url = new URL(raw);
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/222");
    expect(url.searchParams.get("fields")).toBe("id,access_token");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.searchParams.has("appsecret_proof")).toBe(true);
    expect(raw).not.toContain("private-");
    expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", headers: { Authorization: "Bearer private-user-token" } });
    expect(fetcher).toHaveBeenCalledTimes(6);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFacebookOAuthResult(randomUUID(), error.outcome, "page_discovery", error.diagnostics);
    expect(JSON.stringify(error)).not.toMatch(/private-|222/);
    expect(warning.mock.calls[0][0]).not.toMatch(/private-|222/);
    expect(JSON.parse(warning.mock.calls[0][0]).diagnostics.pageGrants.pageTokenProbe.tokensReturned).toBe(1);
  });

  it.each([undefined, null])("reports a matching Page with no credential (%s) without making a connection", async (access_token) => {
    tokenReply.mockImplementation((id: string) => json({ id, access_token }));
    expect((await failure()).diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, missingTokens: 1 });
  });

  it.each([
    { id: "333", access_token: "private-wrong-page-token" },
    { access_token: "private-token-without-identity" },
    { id: "222", access_token: 123 },
    { id: "222", access_token: " " },
    { id: "222", access_token: "x".repeat(16_385) },
  ])("rejects a mismatched or malformed token response %#", async (payload) => {
    tokenReply.mockResolvedValue(json(payload));
    expect((await failure()).diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, invalidResponses: 1 });
  });

  it.each([[403, 10, "rejectedTargets"], [401, 190, "unavailableTargets"], [429, 4, "unavailableTargets"], [503, 2, "unavailableTargets"]])
    ("keeps HTTP %s token-probe errors diagnostic-only", async (status, code, counter) => {
      tokenReply.mockResolvedValue(json({ error: { code, message: "private-provider-error" } }, status as number));
      const error = await failure();
      expect(error.diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, [counter]: 1 });
      expect(error.diagnostics.pageGrants?.readableTargets).toBe(1);
      expect(JSON.stringify(error)).not.toContain("private-");
      expect(fetcher).toHaveBeenCalledTimes(6); // No automatic retry.
    });

  it("preserves the original outcome on a transport failure and does not expose provider error text", async () => {
    tokenReply.mockRejectedValue(new Error("private-request-url-and-token"));
    const error = await failure();
    expect(error.diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, unavailableTargets: 1 });
    expect(JSON.stringify(error)).not.toContain("private-");
  });

  it.each([() => json(null), () => new Response("not-json", { status: 200 })])("treats an unreadable successful response as unavailable %#", async (response) => {
    tokenReply.mockImplementation(response);
    expect((await failure()).diagnostics.pageGrants?.pageTokenProbe).toEqual({ ...defaults, unavailableTargets: 1 });
  });

  it.each([json({ id: "999" }), json({ error: { code: 10 } }, 403)])("never requests a token when the identity probe did not match %#", async (response) => {
    identityReply.mockResolvedValue(response);
    const error = await failure();
    expect(error.diagnostics.pageGrants?.pageTokenProbe.attemptedTargets).toBe(0);
    expect(tokenReply).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("caps token probes at five intersected targets", async () => {
    targets = Array.from({ length: 8 }, (_, i) => String(222 + i));
    const error = await failure();
    expect(error.diagnostics.pageGrants).toMatchObject({ commonTargets: 8, inspectedTargets: 5, truncated: true,
      pageTokenProbe: { ...defaults, attemptedTargets: 5, tokensReturned: 5 } });
    expect(tokenReply.mock.calls.map(([id]) => id)).toEqual(targets.slice(0, 5));
    expect(fetcher).toHaveBeenCalledTimes(14);
    expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it("does not invent target IDs for an all-Pages grant", async () => {
    targets = undefined;
    const error = await failure();
    expect(error.diagnostics.pageGrants?.pageTokenProbe.attemptedTargets).toBe(0);
    expect(identityReply).not.toHaveBeenCalled();
    expect(tokenReply).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
