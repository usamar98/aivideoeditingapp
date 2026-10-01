import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unseal } from "@/lib/social/crypto";
const mocks = vi.hoisted(() => ({ account: vi.fn(), cookies: vi.fn(), exchange: vi.fn(), grant: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/social/facebook", async (original) => ({ ...await original<object>(), exchangeFacebookCode: mocks.exchange, loadFacebookGrant: mocks.grant }));
import { POST as connect } from "@/app/api/social/facebook/connect/route";
import { GET as callback } from "@/app/api/social/facebook/callback/route";
import { POST as deletion, GET as deletionStatus } from "@/app/api/social/facebook/deletion/route";

const user = randomUUID(), receipt = randomUUID(), origin = "https://www.editingapp.live";
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "test-secret");
  vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v25.0"); vi.stubEnv("FACEBOOK_REDIRECT_URI", `${origin}/api/social/facebook/callback`);
  rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
  query = Object.fromEntries(["update", "eq", "gt", "select"].map((key) => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: user }, error: null });
  const admin = { from: () => query, rpc }; mocks.admin.mockReturnValue(admin); mocks.account.mockResolvedValue({ user: { id: user }, admin });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "state" }) }); mocks.exchange.mockResolvedValue("user-token");
  mocks.grant.mockResolvedValue({ userId: "111", token: "user-token", pages: [{ id: "222", name: "Page", access_token: "page-token", tasks: ["CREATE_CONTENT"] }] });
});
afterEach(() => vi.unstubAllEnvs());
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
    expect(response.headers.get("location")).toBe(`${origin}/studio/social/facebook?facebook=connection_failed`); expect(mocks.exchange).not.toHaveBeenCalled();
    query.maybeSingle.mockResolvedValue({ data: null }); await callback(back());
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("consumed", false);
    expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String)); expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("does not save denied grants or those without eligible Pages", async () => {
    expect((await callback(back("state=state&error=access_denied"))).headers.get("location")).toContain("facebook=denied");
    expect(mocks.exchange).not.toHaveBeenCalled(); mocks.grant.mockResolvedValue({ pages: [] });
    expect((await callback(back())).headers.get("location")).toContain("facebook=no_pages"); expect(rpc).not.toHaveBeenCalled();
  });
  it("saves only an encrypted pending grant, requiring explicit Page selection afterwards", async () => {
    const response = await callback(back()); expect(response.headers.get("location")).toContain("facebook=choose_page");
    expect(rpc.mock.calls[0][0]).toBe("prepare_facebook_grant"); const saved = rpc.mock.calls[0][1];
    expect(saved.owner_id).toBe(user); expect(saved.encrypted_grant).toMatch(/^v1\./);
    expect(JSON.parse(unseal(saved.encrypted_grant, `facebook-grant:${user}`)).token).toBe("user-token");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("page-token"); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
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
