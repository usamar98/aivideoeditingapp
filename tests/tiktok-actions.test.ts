import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "@/lib/social/crypto";
const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), resolve: vi.fn(), post: vi.fn(), connection: vi.fn(), revoke: vi.fn(), withToken: vi.fn(), creator: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/social/library", () => ({ resolveVideo: mocks.resolve }));
vi.mock("@/lib/social/tiktok-repository", () => ({ tiktokConnection: mocks.connection, ownedTikTokPost: mocks.post, withTikTokToken: mocks.withToken }));
vi.mock("@/lib/social/tiktok", async (original) => ({ ...await original<object>(), revokeTikTokToken: mocks.revoke, tiktokCreator: mocks.creator }));
import { publishToTikTok, cancelTikTokPost, refreshTikTokPost, disconnectTikTok } from "@/app/studio/social/tiktok/actions";

const user = randomUUID(), postId = randomUUID();
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
const input = () => ({ requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, caption: "Caption", privacy: "SELF_ONLY", allowComments: false, allowDuet: false, allowStitch: false, commercialContent: false, brandOrganic: false, brandedContent: false, syntheticMedia: true, rightsConfirmed: true, musicConfirmed: true, brandedPolicyConfirmed: false, scheduledAt: null });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("TIKTOK_CLIENT_KEY", "key"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "secret"); vi.stubEnv("TIKTOK_REDIRECT_URI", "https://createaivideos.app/api/social/tiktok/callback"); vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "true"); vi.stubEnv("TIKTOK_PUBLIC_POSTING_ENABLED", "false"); vi.stubEnv("TRIGGER_SECRET_KEY", "trigger");
  rpc = vi.fn().mockResolvedValue({ data: postId, error: null });
  query = Object.fromEntries(["delete", "eq"].map((key) => [key, vi.fn(() => query)]));
  mocks.account.mockResolvedValue({ user: { id: user }, admin: { rpc, from: () => query } }); mocks.resolve.mockResolvedValue({ path: "owned/export.mp4" });
  mocks.post.mockResolvedValue({ id: postId, status: "queued" }); mocks.connection.mockResolvedValue({ id: "connection", open_id: "creator-id", status: "connected", tokens: seal(JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh", openId: "creator-id", scopes: ["user.info.basic", "video.publish"], accessExpiresAt: Date.now() + 100000, refreshExpiresAt: Date.now() + 1000000 }), `tiktok:${user}:creator-id`) });
  mocks.withToken.mockImplementation(async (_db, _owner, run) => run("test-access"));
  mocks.creator.mockResolvedValue({ creator_nickname: "Name", creator_username: "creator", privacy_level_options: ["SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 60 });
});
afterEach(() => vi.unstubAllEnvs());
describe("TikTok authenticated server actions", () => {
  it("uses the session owner and resolved export, never forged paths or account IDs", async () => {
    const data = input(); expect((await publishToTikTok({ ...data, user_id: "attacker", sourcePath: "foreign.mp4" })).id).toBe(postId);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), user, data.source); expect(rpc).toHaveBeenCalledWith("enqueue_tiktok_post", { owner_id: user, payload: { ...data, sourcePath: "owned/export.mp4" } }); expect(mocks.trigger).toHaveBeenCalledWith("tiktok-publish", { postId }, expect.objectContaining({ concurrencyKey: postId }));
  });
  it("blocks missing consent, disabled publishing, unowned exports and changed creator choices", async () => {
    expect((await publishToTikTok({ ...input(), rightsConfirmed: false })).error).toBeTruthy(); vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "false"); expect((await publishToTikTok(input())).error).toContain("not been enabled");
    vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "true"); mocks.resolve.mockRejectedValueOnce(new Error("foreign")); expect((await publishToTikTok(input())).error).toBeTruthy();
    expect((await publishToTikTok({ ...input(), allowDuet: true })).error).toContain("creator settings changed"); expect(rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("requires authentication on every mutation, not just the page", async () => {
    mocks.account.mockRejectedValue(new Error("Sign in"));
    for (const result of [await publishToTikTok(input()), await cancelTikTokPost(postId), await refreshTikTokPost(postId), await disconnectTikTok()]) expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("persists schedules without early dispatch and retains queued work when dispatch fails", async () => {
    expect((await publishToTikTok({ ...input(), scheduledAt: new Date(Date.now() + 3600_000).toISOString() })).id).toBe(postId); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.trigger.mockRejectedValueOnce(new Error("private-error")); const result = await publishToTikTok(input()); expect(result.id).toBe(postId); expect(result.warning).toContain("worker could not be reached"); expect(result.warning).not.toContain("private-error");
  });
  it("binds cancellation/status to the session owner and leaves terminal posts alone", async () => {
    expect(await cancelTikTokPost(postId)).toEqual({ success: true }); expect(rpc).toHaveBeenCalledWith("cancel_tiktok_post", { owner_id: user, post_id: postId });
    rpc.mockResolvedValueOnce({ error: { message: "init started" } }); expect((await cancelTikTokPost(postId)).error).toContain("Publication may have started");
    await refreshTikTokPost(postId); expect(mocks.post).toHaveBeenCalledWith(expect.anything(), user, postId);
    mocks.trigger.mockClear(); mocks.post.mockResolvedValueOnce({ id: postId, status: "published" }); await refreshTikTokPost(postId); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("takes the disconnect fence before reading rotated credentials and removes local access even if revoke fails", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "active" } }); expect((await disconnectTikTok()).error).toContain("worker"); expect(mocks.connection).not.toHaveBeenCalled();
    mocks.revoke.mockRejectedValueOnce(new Error("network")); const result = await disconnectTikTok(); expect(result.success).toBe(true); expect(result.warning).toContain("remote revocation was not confirmed"); expect(mocks.revoke).toHaveBeenCalledWith("test-access"); expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("status", "disconnecting");
  });
});
