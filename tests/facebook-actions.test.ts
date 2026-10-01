import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "@/lib/social/crypto";
const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), resolve: vi.fn(), post: vi.fn(), connection: vi.fn(), revoke: vi.fn(), grant: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/social/library", () => ({ resolveVideo: mocks.resolve }));
vi.mock("@/lib/social/facebook-repository", () => ({ facebookConnection: mocks.connection, ownedFacebookPost: mocks.post, pendingFacebookGrant: mocks.grant }));
vi.mock("@/lib/social/facebook", async (original) => ({ ...await original<object>(), revokeFacebookGrant: mocks.revoke, verifyFacebookPage: mocks.verify }));
import { publishToFacebook, cancelFacebookPost, refreshFacebookPost, disconnectFacebook, selectFacebookPage } from "@/app/studio/social/facebook/actions";

const user = randomUUID(), postId = randomUUID();
let rpc: ReturnType<typeof vi.fn>, query: Record<string, ReturnType<typeof vi.fn>>;
const input = () => ({ requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, title: "Test", description: "", scheduledAt: null, syntheticMedia: true, rightsConfirmed: true });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "test-secret");
  vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v25.0"); vi.stubEnv("FACEBOOK_REDIRECT_URI", "http://localhost:3004/api/social/facebook/callback");
  vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "true"); vi.stubEnv("TRIGGER_SECRET_KEY", "test-value");
  rpc = vi.fn().mockResolvedValue({ data: postId, error: null });
  query = Object.fromEntries(["delete", "eq"].map((key) => [key, vi.fn(() => query)]));
  mocks.account.mockResolvedValue({ user: { id: user }, admin: { rpc, from: () => query } }); mocks.resolve.mockResolvedValue({ path: "owned/export.mp4" });
  mocks.post.mockResolvedValue({ id: postId, status: "queued" }); mocks.connection.mockResolvedValue({ id: "connection", page_id: "222", facebook_user_id: "111", status: "connected", user_token: seal("user-token", `facebook-user:${user}:111`) });
  mocks.grant.mockResolvedValue({ state: "state", userId: "111", token: "user-token", pages: [{ id: "222", name: "Selected Page", access_token: "page-token" }] });
});
afterEach(() => vi.unstubAllEnvs());
describe("Facebook server actions", () => {
  it("uses the authenticated owner and resolved export, ignoring forged paths", async () => {
    const data = input(), result = await publishToFacebook({ ...data, user_id: "attacker", sourcePath: "foreign/video.mp4" }); expect(result.id).toBe(postId);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), user, data.source);
    expect(rpc).toHaveBeenCalledWith("enqueue_facebook_post", { owner_id: user, payload: { ...data, sourcePath: "owned/export.mp4" } });
    expect(mocks.trigger).toHaveBeenCalledWith("facebook-publish", { postId }, expect.objectContaining({ concurrencyKey: postId }));
  });
  it("blocks missing consent, disabled publishing and foreign sources before queueing", async () => {
    expect((await publishToFacebook({ ...input(), rightsConfirmed: false })).error).toBeTruthy();
    vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "false"); expect((await publishToFacebook(input())).error).toContain("not been enabled");
    vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "true"); mocks.resolve.mockRejectedValue(new Error("Video is not owned by your account"));
    expect((await publishToFacebook(input())).error).toContain("owned"); expect(rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("persists schedules without early dispatch and preserves queued work after dispatch failure", async () => {
    expect((await publishToFacebook({ ...input(), scheduledAt: new Date(Date.now() + 3600_000).toISOString() })).id).toBe(postId);
    expect(mocks.trigger).not.toHaveBeenCalled(); mocks.trigger.mockRejectedValue(new Error("secret-provider-error"));
    const result = await publishToFacebook(input()); expect(result.id).toBe(postId); expect(result.warning).toContain("worker could not be reached");
  });
  it("allows only an eligible Page from the encrypted pending grant, not an arbitrary Page/token", async () => {
    expect((await selectFacebookPage("999")).error).toContain("expired"); expect(mocks.verify).not.toHaveBeenCalled();
    expect(await selectFacebookPage("222")).toEqual({ success: true }); expect(mocks.verify).toHaveBeenCalledWith("page-token", "222");
    expect(rpc).toHaveBeenCalledWith("complete_facebook_oauth", expect.objectContaining({ owner_id: user, remote_user: "111", page: "222", encrypted_page_token: expect.stringMatching(/^v1\./) }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("page-token");
  });
  it("binds cancellation/rechecks to the user and respects the no-cancel finish boundary", async () => {
    expect(await cancelFacebookPost(postId)).toEqual({ success: true }); expect(rpc).toHaveBeenCalledWith("cancel_facebook_post", { owner_id: user, post_id: postId });
    rpc.mockResolvedValue({ error: { message: "Publication started" } }); expect((await cancelFacebookPost(postId)).error).toContain("Cannot cancel");
    await refreshFacebookPost(postId); expect(mocks.post).toHaveBeenCalledWith(expect.anything(), user, postId);
    mocks.connection.mockResolvedValue({ status: "reconnect" }); expect((await refreshFacebookPost(postId)).error).toContain("Reconnect");
  });
  it("blocks active-worker disconnect and removes local access with a warning if revocation fails", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "active" } }); expect((await disconnectFacebook()).error).toContain("worker is active"); expect(mocks.revoke).not.toHaveBeenCalled();
    mocks.revoke.mockRejectedValue(new Error("network")); const result = await disconnectFacebook(); expect(result.success).toBe(true); expect(result.warning).toContain("revocation was not confirmed");
    expect(query.eq).toHaveBeenCalledWith("user_id", user); expect(query.eq).toHaveBeenCalledWith("status", "disconnecting"); expect(query.delete).toHaveBeenCalled();
  });
});
