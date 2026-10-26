import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash, unseal } from "@/lib/social/crypto";
const mocks = vi.hoisted(() => ({ account: vi.fn(), cookies: vi.fn(), exchange: vi.fn(), user: vi.fn(), creator: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/social/tiktok", async (original) => ({ ...await original<object>(), exchangeTikTokCode: mocks.exchange, tiktokUser: mocks.user, tiktokCreator: mocks.creator }));
import { POST as connect } from "@/app/api/social/tiktok/connect/route";
import { GET as callback } from "@/app/api/social/tiktok/callback/route";

const user = randomUUID(), origin = "https://createaivideos.app";
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("TIKTOK_CLIENT_KEY", "key"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "private-secret"); vi.stubEnv("TIKTOK_REDIRECT_URI", `${origin}/api/social/tiktok/callback`); vi.stubEnv("TRIGGER_SECRET_KEY", "trigger"); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  rpc = vi.fn().mockResolvedValue({ error: null });
  query = Object.fromEntries(["update", "eq", "gt", "select"].map((key) => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: user }, error: null });
  mocks.account.mockResolvedValue({ user: { id: user }, admin: { from: () => query, rpc } }); mocks.cookies.mockResolvedValue({ get: () => ({ value: "state" }) });
  mocks.exchange.mockResolvedValue({ accessToken: "test-access", refreshToken: "test-refresh", openId: "creator-id", scopes: ["user.info.basic", "video.publish"], accessExpiresAt: Date.now() + 86400_000, refreshExpiresAt: Date.now() + 31536000_000 });
  mocks.user.mockResolvedValue({ open_id: "creator-id", display_name: "Private profile" }); mocks.creator.mockResolvedValue({ creator_nickname: "Creator", creator_username: "creator" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const start = (from = origin, policy = "agree") => new Request(`${origin}/api/social/tiktok/connect`, { method: "POST", headers: { origin: from }, body: new URLSearchParams({ policy }) });
const back = (params = "state=state&code=private-code") => new Request(`${origin}/api/social/tiktok/callback?${params}`);

describe("TikTok OAuth CSRF, owner binding and secret handling", () => {
  it("requires same-origin consent/authentication before saving state", async () => {
    expect((await connect(start("https://evil.test"))).status).toBe(403); expect((await connect(start(origin, "no"))).status).toBe(400); expect(mocks.account).not.toHaveBeenCalled();
    mocks.account.mockRejectedValueOnce(new Error("no session")); expect((await connect(start())).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("hashes owner-bound state, sets a secure HTTP-only ten-minute cookie and redirects without secrets", async () => {
    const response = await connect(start()), url = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303); expect(url.origin).toBe("https://www.tiktok.com"); const state = url.searchParams.get("state")!;
    expect(state).toHaveLength(43); expect(rpc).toHaveBeenCalledWith("begin_tiktok_oauth", { owner_id: user, state_digest: hash(state) });
    for (const attribute of ["HttpOnly", "Secure", "SameSite=lax", "Max-Age=600"]) expect(response.headers.get("set-cookie")).toContain(attribute);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(JSON.stringify([...response.headers])).not.toContain("private-secret");
  });
  it("rejects mismatched/missing/replayed/expired state before code exchange and ignores arbitrary redirect targets", async () => {
    const response = await callback(back("state=wrong&code=private-code&next=https://evil.test")), url = new URL(response.headers.get("location")!);
    expect(url.origin + url.pathname).toBe(`${origin}/studio/social/tiktok`); expect(url.searchParams.get("tiktok")).toBe("connection_failed"); expect(url.searchParams.get("tiktok_ref")).toMatch(/^[a-f\d-]{36}$/); expect(mocks.exchange).not.toHaveBeenCalled();
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); await callback(back());
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("consumed", false); expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String)); expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("consumes a denied grant without saving tokens and never leaks provider content in logs", async () => {
    expect((await callback(back("state=state&error=denied&error_description=private-secret"))).headers.get("location")).toContain("tiktok=denied"); expect(mocks.exchange).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    mocks.exchange.mockRejectedValueOnce(new Error("private-secret private-code")); await callback(back());
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-secret|private-code|test-access/);
  });
  it("verifies token/profile identity, stores only context-bound encrypted credentials and clears state cookie", async () => {
    const response = await callback(back()); expect(response.headers.get("location")).toBe(`${origin}/studio/social/tiktok?tiktok=connected`);
    const saved = rpc.mock.calls[0][1]; expect(rpc.mock.calls[0][0]).toBe("complete_tiktok_oauth"); expect(saved.owner_id).toBe(user); expect(saved.remote_user).toBe("creator-id");
    expect(saved.encrypted_tokens).toMatch(/^v1\./); expect(JSON.parse(unseal(saved.encrypted_tokens, `tiktok:${user}:creator-id`)).refreshToken).toBe("test-refresh"); expect(JSON.stringify(rpc.mock.calls)).not.toContain("test-access");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0"); expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({ event: "tiktok.oauth", outcome: "connected", stage: "complete" });
  });
  it("does not attach a mismatched identity or claim success after failed account binding", async () => {
    mocks.user.mockResolvedValueOnce({ open_id: "wrong" }); expect((await callback(back())).headers.get("location")).toContain("tiktok=connection_failed"); expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ error: { message: "different account" } }); expect((await callback(back())).headers.get("location")).toContain("tiktok=connection_failed");
  });
});
