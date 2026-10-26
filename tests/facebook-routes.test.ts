import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unseal } from "@/lib/social/crypto";
import { FacebookGrantError, facebookGrantSchema } from "@/lib/social/facebook";
import { FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { facebookGrantDiagnostics, recordFacebookPageTasks } from "@/lib/social/facebook-oauth-diagnostics";
const mocks = vi.hoisted(() => ({ account: vi.fn(), cookies: vi.fn(), exchange: vi.fn(), grant: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/social/facebook", async (original) => ({ ...await original<object>(), exchangeFacebookCode: mocks.exchange, loadFacebookGrant: mocks.grant }));
import { POST as connect } from "@/app/api/social/facebook/connect/route";
import { GET as callback } from "@/app/api/social/facebook/callback/route";
import { POST as deletion, GET as deletionStatus } from "@/app/api/social/facebook/deletion/route";

const user = randomUUID(), receipt = randomUUID(), origin = "https://createaivideos.app";
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "test-secret");
  vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v25.0"); vi.stubEnv("FACEBOOK_REDIRECT_URI", `${origin}/api/social/facebook/callback`);
  rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
  query = Object.fromEntries(["update", "eq", "gt", "select"].map((key) => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: user }, error: null });
  const admin = { from: () => query, rpc }; mocks.admin.mockReturnValue(admin); mocks.account.mockResolvedValue({ user: { id: user }, admin });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "state" }) }); mocks.exchange.mockResolvedValue("user-token");
  const diagnostics = facebookGrantDiagnostics(["pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })));
  recordFacebookPageTasks(diagnostics, ["CREATE_CONTENT"], true);
  mocks.grant.mockResolvedValue({ userId: "111", token: "user-token", pages: [{ id: "222", name: "Page", access_token: "page-token", tasks: ["CREATE_CONTENT"] }], diagnostics });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const start = (from = origin, policy = "agree") => new Request(`${origin}/api/social/facebook/connect`, { method: "POST", headers: { origin: from }, body: new URLSearchParams({ policy }) });
const back = (params = "state=state&code=authorization-code") => new Request(`${origin}/api/social/facebook/callback?${params}`);
describe("Facebook OAuth and deletion routes", () => {
  it("requires same-origin consent and an authenticated account", async () => {
    expect((await connect(start("https://attacker.test"))).status).toBe(403); expect((await connect(start(origin, "no"))).status).toBe(400);
    expect(mocks.account).not.toHaveBeenCalled(); mocks.account.mockRejectedValue(new Error("Sign in"));
    expect((await connect(start())).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("hashes state and uses a secure ten-minute cookie without returning secrets", async () => {
    const response = await connect(start()), url = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303); expect(url.origin).toBe("https://www.facebook.com");
    expect(rpc.mock.calls[0][1].state_digest).not.toBe(url.searchParams.get("state"));
    for (const attribute of ["HttpOnly", "Secure", "SameSite=lax"]) expect(response.headers.get("set-cookie")).toContain(attribute);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=600"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(JSON.stringify([...response.headers])).not.toContain("test-secret");
  });
  it("rejects mismatched, replayed or expired state and ignores arbitrary redirect targets", async () => {
    const response = await callback(back("state=wrong&code=secret&next=https://attacker.test"));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.origin + destination.pathname).toBe(`${origin}/studio/social/facebook`);
    expect(destination.searchParams.get("facebook")).toBe("connection_failed");
    expect(destination.searchParams.get("facebook_ref")).toMatch(/^[a-f\d-]{36}$/);
    expect(mocks.exchange).not.toHaveBeenCalled();
    query.maybeSingle.mockResolvedValue({ data: null }); await callback(back());
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("consumed", false);
    expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String)); expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("does not save denied grants or those without eligible Pages", async () => {
    expect((await callback(back("state=state&error=access_denied"))).headers.get("location")).toContain("facebook=denied");
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.grant.mockRejectedValue(new FacebookGrantError("pages_not_returned", facebookGrantDiagnostics([])));
    expect((await callback(back())).headers.get("location")).toContain("facebook=pages_not_returned"); expect(rpc).not.toHaveBeenCalled();
  });
  it("saves only an encrypted pending grant, requiring explicit Page selection afterwards", async () => {
    const response = await callback(back()); expect(response.headers.get("location")).toContain("facebook=choose_page");
    expect(rpc.mock.calls[0][0]).toBe("prepare_facebook_grant"); const saved = rpc.mock.calls[0][1];
    expect(saved.owner_id).toBe(user); expect(saved.encrypted_grant).toMatch(/^v1\./);
    const grant = JSON.parse(unseal(saved.encrypted_grant, `facebook-grant:${user}`));
    expect(grant.token).toBe("user-token"); expect(grant).not.toHaveProperty("diagnostics");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("page-token"); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("location")).not.toContain("facebook_ref");
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({ event: "facebook.oauth", outcome: "choose_page", stage: "complete", diagnostics: { returnedPages: 1, eligiblePages: 1 } });
  });
  it("walks empty accounts through real direct-token validation to an encrypted pending Page selection, without posting", async () => {
    const provider = await vi.importActual<typeof import("@/lib/social/facebook")>("@/lib/social/facebook");
    mocks.grant.mockImplementation(provider.loadFacebookGrant);
    const scopes = FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: ["222"] }));
    const meta = { app_id: "123", user_id: "111", is_valid: true, expires_at: 0, scopes: [...FACEBOOK_SCOPES], granular_scopes: scopes };
    const fetcher = vi.fn(async (raw: string, options: RequestInit) => {
      const url = new URL(raw), endpoint = url.pathname.split("/").at(-1);
      if (endpoint === "me") return Response.json(new Headers(options.headers).get("Authorization") === "Bearer page-token" ? { id: "222", name: "Verified Page" } : { id: "111" });
      if (endpoint === "permissions") return Response.json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) });
      if (endpoint === "accounts") return Response.json({ data: [] });
      if (endpoint === "debug_token") return Response.json({ data: { ...meta, ...(url.searchParams.get("input_token") === "page-token" ? { type: "PAGE", profile_id: "222" } : { type: "USER" }) } });
      return Response.json({ id: "222", ...(url.searchParams.get("fields") === "id,access_token" ? { access_token: "page-token" } : {}) });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await callback(back());
    expect(response.headers.get("location")).toBe(`${origin}/studio/social/facebook?facebook=choose_page`);
    expect(rpc).toHaveBeenCalledTimes(1); expect(rpc.mock.calls[0][0]).toBe("prepare_facebook_grant");
    const saved = rpc.mock.calls[0][1];
    const grant = facebookGrantSchema.parse(JSON.parse(unseal(saved.encrypted_grant, `facebook-grant:${user}`)));
    expect(grant.pages).toEqual([{ id: "222", name: "Verified Page", access_token: "page-token", tasks: [], authorization: "direct_page_token" }]);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({ outcome: "choose_page", stage: "complete", diagnostics: {
      returnedPages: 0, eligiblePages: 1, directPageLookup: { verifiedPages: 1 },
    } });
    const exposed = JSON.stringify([...response.headers]) + JSON.stringify(vi.mocked(console.info).mock.calls) + JSON.stringify(rpc.mock.calls);
    expect(exposed).not.toMatch(/page-token|user-token|test-secret|authorization-code/);
    expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
  it.each(["permissions_missing", "pages_not_returned", "page_content_access_missing", "page_token_access_unverified"] as const)("returns %s and a matching opaque support reference without saving a connection", async (outcome) => {
    const diagnostics = facebookGrantDiagnostics([]);
    if (outcome === "page_content_access_missing") recordFacebookPageTasks(diagnostics, ["ANALYZE", "private-task-token\nsecret"], false);
    mocks.grant.mockRejectedValue(new FacebookGrantError(outcome, diagnostics));
    const response = await callback(back()), destination = new URL(response.headers.get("location")!);
    const reference = destination.searchParams.get("facebook_ref");
    expect(destination.searchParams.get("facebook")).toBe(outcome);
    expect(reference).toMatch(/^[a-f\d-]{36}$/);
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toMatchObject({ reference, outcome, stage: "page_discovery", diagnostics });
    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    const publicOutput = JSON.stringify([...response.headers]) + JSON.stringify(vi.mocked(console.warn).mock.calls);
    for (const secret of ["user-token", "page-token", "authorization-code", "test-secret", "private-task-token", user]) expect(publicOutput).not.toContain(secret);
  });
  it("logs only the failed stage for unexpected errors, never their message, stack or provider payload", async () => {
    mocks.exchange.mockRejectedValue(new Error("private-code private-user-token https://example.test/?client_secret=private-secret"));
    const response = await callback(back());
    expect(response.headers.get("location")).toContain("facebook=connection_failed");
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toMatchObject({ outcome: "connection_failed", stage: "exchange_code" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-|client_secret|authorization-code|user-token/);
    expect(mocks.grant).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unsigned/oversized deletion, verifies signed requests, and returns an opaque receipt", async () => {
    const request = (value: string) => new Request(`${origin}/api/social/facebook/deletion`, { method: "POST", body: new URLSearchParams({ signed_request: value }) });
    expect((await deletion(request("forged"))).status).toBe(400); expect((await deletion(request("x".repeat(17000)))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "111", issued_at: Math.floor(Date.now() / 1000) })).toString("base64url");
    const signature = createHmac("sha256", "test-secret").update(payload).digest("base64url");
    const response = await deletion(request(`${signature}.${payload}`));
    expect(await response.json()).toEqual({ confirmation_code: receipt, url: `${origin}/api/social/facebook/deletion?code=${receipt}` });
    expect(rpc).toHaveBeenCalledWith("delete_facebook_data", { remote_user: "111", remote_hash: expect.stringMatching(/^[a-f\d]{64}$/) });
    expect((await deletionStatus(new Request(`${origin}/api/social/facebook/deletion?code=${receipt}`))).status).toBe(200);
    query.maybeSingle.mockResolvedValue({ data: null }); expect((await deletionStatus(new Request(`${origin}/api/social/facebook/deletion?code=${receipt}`))).status).toBe(404);
  });
});
