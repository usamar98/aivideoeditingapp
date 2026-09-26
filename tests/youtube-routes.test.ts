import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { seal } from "@/lib/social/crypto";
import { YOUTUBE_SCOPE } from "@/lib/social/config";

const mocks = vi.hoisted(() => ({ account: vi.fn(), cookies: vi.fn(), exchange: vi.fn(), channel: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/social/repository", () => ({ connection: mocks.connection }));
vi.mock("@/lib/social/youtube", async (original) => ({ ...await original<object>(), exchangeCode: mocks.exchange, channelForToken: mocks.channel }));
import { POST } from "@/app/api/social/youtube/connect/route";
import { GET } from "@/app/api/social/youtube/callback/route";

const user = randomUUID(), channel = "UC" + "x".repeat(22);
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "test-client"); vi.stubEnv("YOUTUBE_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("YOUTUBE_REDIRECT_URI", "https://www.editingapp.live/api/social/youtube/callback");
  rpc = vi.fn().mockResolvedValue({ error: null });
  query = Object.fromEntries(["update", "eq", "gt", "select"].map((key) => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { verifier: seal("verifier", `oauth:${user}`) }, error: null });
  mocks.account.mockResolvedValue({ user: { id: user }, admin: { from: () => query, rpc } });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "state" }) });
  mocks.connection.mockResolvedValue(null);
  mocks.exchange.mockResolvedValue({ access_token: "access-secret", refresh_token: "refresh-secret", scope: YOUTUBE_SCOPE });
  mocks.channel.mockResolvedValue({ id: channel, title: "My channel" });
});
afterEach(() => vi.unstubAllEnvs());
function connectRequest(origin = "https://www.editingapp.live", consent = "agree") {
  return new Request("https://www.editingapp.live/api/social/youtube/connect", { method: "POST", headers: { origin }, body: new URLSearchParams({ policy: consent }) });
}
function callback(query = "state=state&code=code") { return new Request(`https://www.editingapp.live/api/social/youtube/callback?${query}`); }
describe("YouTube OAuth routes", () => {
  it("rejects cross-origin requests and missing policy consent before accessing credentials", async () => {
    expect((await POST(connectRequest("https://evil.example"))).status).toBe(403);
    expect((await POST(connectRequest(undefined, "no"))).status).toBe(400);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("sets a short-lived HTTP-only secure state cookie and stores no plain verifier", async () => {
    const response = await POST(connectRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("https://accounts.google.com/");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=lax/); expect(cookie).toMatch(/Max-Age=600/);
    expect(rpc.mock.calls[0][0]).toBe("begin_social_oauth");
    expect(rpc.mock.calls[0][1].encrypted_verifier).toMatch(/^v1\./);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rejects mismatched browser state without exchanging a code", async () => {
    const response = await GET(callback("state=wrong&code=secret-code&next=https://evil.test"));
    expect(response.headers.get("location")).toBe("https://www.editingapp.live/studio/social?youtube=connection_failed");
    expect(mocks.exchange).not.toHaveBeenCalled(); expect(mocks.account).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("requires unused, unexpired state bound to the current ETA user", async () => {
    query.maybeSingle.mockResolvedValue({ data: null });
    const response = await GET(callback());
    expect(response.headers.get("location")).toContain("connection_failed");
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("consumed", false);
    expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("handles consent denial and missing scopes without storing a connection", async () => {
    expect((await GET(callback("state=state&error=access_denied"))).headers.get("location")).toContain("youtube=denied");
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.exchange.mockResolvedValue({ access_token: "a", refresh_token: "r", scope: "openid email" });
    expect((await GET(callback())).headers.get("location")).toContain("youtube=permissions"); expect(rpc).not.toHaveBeenCalled();
  });
  it("stores only encrypted tokens through the atomic completion RPC", async () => {
    const response = await GET(callback());
    expect(response.headers.get("location")).toContain("youtube=connected");
    expect(mocks.exchange).toHaveBeenCalledWith("code", "verifier");
    expect(rpc.mock.calls[0]).toEqual(["complete_social_oauth", expect.objectContaining({ owner_id: user, channel, encrypted_token: expect.stringMatching(/^v1\./) })]);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("refresh-secret");
    expect(JSON.stringify([...response.headers])).not.toContain("secret");
  });
  it("does not silently replace a channel with pending uploads", async () => {
    mocks.connection.mockResolvedValue({ channel_id: "other-channel", status: "connected" });
    const response = await GET(callback()); expect(response.headers.get("location")).toContain("youtube=different_channel"); expect(rpc).not.toHaveBeenCalled();
  });
});
