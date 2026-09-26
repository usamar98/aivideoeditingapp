import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), resolve: vi.fn(), post: vi.fn(), connection: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/social/library", () => ({ resolveVideo: mocks.resolve }));
vi.mock("@/lib/social/repository", () => ({ connection: mocks.connection, ownedPost: mocks.post }));
vi.mock("@/lib/social/youtube", async (original) => ({ ...await original<object>(), revokeToken: mocks.revoke }));
import { publishToYouTube, cancelYouTubePost, refreshYouTubePost, disconnectYouTube } from "@/app/studio/social/actions";
import { seal } from "@/lib/social/crypto";

const user = randomUUID(), postId = randomUUID();
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
const input = () => ({ requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, title: "Test", description: "", visibility: "private", scheduledAt: null, madeForKids: false, syntheticMedia: true, rightsConfirmed: true });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  for (const key of ["YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET", "TRIGGER_SECRET_KEY"]) vi.stubEnv(key, "test-value");
  vi.stubEnv("YOUTUBE_REDIRECT_URI", "http://localhost:3004/api/social/youtube/callback"); vi.stubEnv("YOUTUBE_PUBLIC_PUBLISHING_ENABLED", "false");
  rpc = vi.fn().mockResolvedValue({ data: postId });
  query = Object.fromEntries(["update", "delete", "eq", "not", "select"].map((key) => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: postId } });
  mocks.account.mockResolvedValue({ user: { id: user }, admin: { rpc, from: () => query } });
  mocks.resolve.mockResolvedValue({ path: "owned/export.mp4" });
  mocks.post.mockResolvedValue({ id: postId, status: "queued" });
  mocks.connection.mockResolvedValue({ id: randomUUID(), channel_id: "UCchannel", status: "connected", refresh_token: seal("refresh", `youtube:${user}:UCchannel`) });
});
afterEach(() => vi.unstubAllEnvs());
describe("YouTube server actions", () => {
  it("binds a request to the authenticated owner and server-resolved source path", async () => {
    const data = input(); const result = await publishToYouTube({ ...data, user_id: "attacker", sourcePath: "foreign/video.mp4" });
    expect(result.id).toBe(postId);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), user, data.source);
    expect(rpc).toHaveBeenCalledWith("enqueue_social_post", { owner_id: user, payload: { ...data, sourcePath: "owned/export.mp4" } });
    expect(mocks.trigger).toHaveBeenCalledWith("youtube-publish", { postId }, expect.objectContaining({ concurrencyKey: postId, idempotencyKey: `youtube-start:${postId}` }));
  });
  it("blocks unaudited public requests, missing consent and unowned exports before queueing", async () => {
    expect((await publishToYouTube({ ...input(), visibility: "public" })).error).toContain("private test");
    expect((await publishToYouTube({ ...input(), rightsConfirmed: false })).error).toBeTruthy();
    mocks.resolve.mockRejectedValue(new Error("Choose a completed video owned by your account."));
    expect((await publishToYouTube(input())).error).toContain("owned"); expect(rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("retains a saved upload if the worker is unreachable, without claiming it started", async () => {
    mocks.trigger.mockRejectedValue(new Error("provider secret"));
    const result = await publishToYouTube(input()); expect(result.id).toBe(postId); expect(result.warning).toContain("worker could not be reached"); expect(JSON.stringify(result)).not.toContain("provider secret");
  });
  it("records cancellation as pending and scopes the update to the owner", async () => {
    expect(await cancelYouTubePost(postId)).toEqual({ success: true });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelling", cancel_requested: true }));
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(mocks.post).toHaveBeenCalledWith(expect.anything(), user, postId);
  });
  it("does not overwrite a just-completed post with a cancellation or fake completion", async () => {
    query.maybeSingle.mockResolvedValue({ data: null });
    expect((await cancelYouTubePost(postId)).error).toContain("changed"); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.post.mockResolvedValue({ id: postId, status: "published" });
    expect((await cancelYouTubePost(postId)).error).toContain("already complete");
  });
  it("requires the same connected account for retries and does not disconnect active workers", async () => {
    mocks.connection.mockResolvedValue({ status: "reconnect" });
    expect((await refreshYouTubePost(postId)).error).toContain("Reconnect");
    rpc.mockResolvedValue({ error: { message: "lease held" } });
    expect((await disconnectYouTube()).error).toContain("worker is active"); expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("revokes access before deleting connection data and cleans stale states even if already disconnected", async () => {
    expect(await disconnectYouTube()).toEqual({ success: true });
    expect(mocks.revoke).toHaveBeenCalledWith("refresh"); expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("status", "disconnecting");
    mocks.connection.mockResolvedValue(null);
    expect(await disconnectYouTube()).toEqual({ success: true }); expect(rpc).toHaveBeenLastCalledWith("begin_social_disconnect", { owner_id: user });
  });
});
