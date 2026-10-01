import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FacebookPost } from "@/lib/social/facebook-types";
import { seal } from "@/lib/social/crypto";

vi.mock("@trigger.dev/sdk", () => ({ task: (v: unknown) => v, schedules: { task: (v: unknown) => v }, tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/social/library", () => ({ resolveVideo: vi.fn() }));
vi.mock("@/lib/social/facebook", async (original) => ({ ...await original<object>(), createFacebookReel: vi.fn(), uploadFacebookReel: vi.fn(), facebookReelStatus: vi.fn(), finishFacebookReel: vi.fn(), verifyFacebookPage: vi.fn() }));
import { createFacebookReel, uploadFacebookReel, facebookReelStatus, finishFacebookReel, verifyFacebookPage, FacebookError, type FacebookReelStatus } from "@/lib/social/facebook";
import { facebookRemoteOutcome, runFacebookPost } from "../trigger/facebook-publish";

type Row = Record<string, unknown>;
let post: FacebookPost, linked: Row, remote: FacebookReelStatus, claimed: boolean, deleted: boolean, cancelAtFinish: boolean;
const prepare = vi.fn();
function database(): SupabaseClient {
  function from(table: string) {
    let patch: Row | undefined;
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      select: () => query, update: (v: Row) => { patch = v; return query; },
      eq: (k: string, v: unknown) => { filters.push((row) => row[k] === v); return query; },
      neq: (k: string, v: unknown) => { filters.push((row) => row[k] !== v); return query; },
      gt: (k: string, v: string) => { filters.push((row) => String(row[k]) > v); return query; },
      maybeSingle: async () => execute(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
    };
    function execute() {
      const row: Row = table === "facebook_posts" ? post : linked;
      if (deleted || !filters.every((filter) => filter(row))) return { data: null, error: null };
      if (patch) Object.assign(row, patch);
      return { data: { ...row }, error: null };
    }
    return query;
  }
  return { from, rpc: async (name: string, input: { worker_token: string }) => {
    if (name === "begin_facebook_finish") {
      if (cancelAtFinish) post.status = "cancelled";
      if (deleted || post.status === "cancelled" || post.finish_started_at || post.lease_token !== input.worker_token) return { data: false, error: null };
      post.finish_started_at = new Date().toISOString(); post.status = "publishing"; return { data: true, error: null };
    }
    if (!claimed || deleted) return { data: false, error: null };
    post.lease_token = input.worker_token; post.lease_until = new Date(Date.now() + 900_000).toISOString();
    return { data: true, error: null };
  } } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "true");
  claimed = true; deleted = false; cancelAtFinish = false;
  post = { id: randomUUID(), user_id: randomUUID(), connection_id: randomUUID(), source_kind: "shorts", source_project_id: randomUUID(), source_output_key: "clip-1", source_path: "owned/source.mp4", title: "Title", description: "Caption", scheduled_at: null, synthetic_media: true, status: "queued", video_id: null, upload_started_at: null, finish_started_at: null, attempts: 0, lease_token: null, lease_until: null, next_check_at: new Date().toISOString(), error_message: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  linked = { id: post.connection_id, user_id: post.user_id, page_id: "222", status: "connected", page_token: seal("fake-token", `facebook-page:${post.user_id}:222`) };
  remote = { id: "444", status: { video_status: "processing", uploading_phase: { status: "complete" }, processing_phase: { status: "not_started" }, publishing_phase: { status: "not_started" } } };
  prepare.mockReset(); prepare.mockResolvedValue("https://storage.example/video.mp4");
  vi.mocked(verifyFacebookPage).mockResolvedValue({ id: "222", name: "Page" });
  vi.mocked(createFacebookReel).mockResolvedValue("444"); vi.mocked(uploadFacebookReel).mockResolvedValue(undefined);
  vi.mocked(facebookReelStatus).mockImplementation(async () => structuredClone(remote));
  vi.mocked(finishFacebookReel).mockImplementation(async () => { remote.status.publishing_phase = { status: "complete" }; });
});
afterEach(() => vi.unstubAllEnvs());
describe("Facebook worker safety", () => {
  it("validates once, uploads once, adds chosen AI caption, and confirms publishing", async () => {
    await runFacebookPost(database(), post.id, prepare);
    expect(prepare).toHaveBeenCalledOnce(); expect(createFacebookReel).toHaveBeenCalledOnce(); expect(uploadFacebookReel).toHaveBeenCalledOnce();
    expect(finishFacebookReel).toHaveBeenCalledWith("fake-token", "222", "444", "Title", "Caption\n\nAI-generated or digitally altered video.");
    expect(post).toMatchObject({ status: "published", video_id: "444", lease_token: null }); expect(post.finish_started_at).toBeTruthy();
  });
  it("never replays finish or uploads a duplicate after a lost publication response", async () => {
    vi.mocked(finishFacebookReel).mockImplementationOnce(async () => { remote.status.publishing_phase = { status: "complete" }; throw new FacebookError("unavailable", "Response lost"); });
    await runFacebookPost(database(), post.id, prepare); expect(post.status).toBe("publishing");
    await runFacebookPost(database(), post.id, prepare);
    expect(finishFacebookReel).toHaveBeenCalledOnce(); expect(createFacebookReel).toHaveBeenCalledOnce(); expect(uploadFacebookReel).toHaveBeenCalledOnce(); expect(post.status).toBe("published");
  });
  it("a persisted finish intent with no remote confirmation only checks the existing Reel", async () => {
    post.video_id = "444"; post.upload_started_at = post.created_at; post.finish_started_at = post.created_at;
    await runFacebookPost(database(), post.id, prepare);
    expect(post.status).toBe("publishing"); expect(finishFacebookReel).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
  it("does not confuse an encoded video with a published Reel", () => {
    remote.status.video_status = "ready";
    expect(facebookRemoteOutcome(remote)).toBe("pending");
    remote.status.processing_phase = { status: "error" }; expect(facebookRemoteOutcome(remote)).toBe("failed");
  });
  it("keeps future schedules local and never intentionally starts a missed schedule", async () => {
    post.scheduled_at = new Date(Date.now() + 3600_000).toISOString(); await runFacebookPost(database(), post.id, prepare);
    expect(post.status).toBe("scheduled"); expect(verifyFacebookPage).not.toHaveBeenCalled();
    post.scheduled_at = new Date(Date.now() - 3600_000).toISOString(); await runFacebookPost(database(), post.id, prepare);
    expect(post.status).toBe("needs_attention"); expect(createFacebookReel).not.toHaveBeenCalled();
  });
  it("honors cancellation before any work and at the finish transaction boundary", async () => {
    post.status = "cancelled"; await runFacebookPost(database(), post.id, prepare); expect(verifyFacebookPage).not.toHaveBeenCalled();
    post.status = "queued"; cancelAtFinish = true; await runFacebookPost(database(), post.id, prepare);
    expect(post.status).toBe("cancelled"); expect(post.finish_started_at).toBeNull(); expect(finishFacebookReel).not.toHaveBeenCalled();
  });
  it("does not publish after cancellation or signed deletion during media preparation", async () => {
    prepare.mockImplementationOnce(async () => { post.status = "cancelled"; return "url"; });
    await runFacebookPost(database(), post.id, prepare); expect(createFacebookReel).not.toHaveBeenCalled();
    post.status = "queued"; prepare.mockImplementationOnce(async () => { deleted = true; return "url"; });
    await runFacebookPost(database(), post.id, prepare); expect(createFacebookReel).not.toHaveBeenCalled(); expect(finishFacebookReel).not.toHaveBeenCalled();
  });
  it("rejects an unsupported/unowned source before provider upload", async () => {
    prepare.mockRejectedValueOnce(new FacebookError("rejected", "Video not owned or wrong format"));
    await runFacebookPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention"); expect(createFacebookReel).not.toHaveBeenCalled();
  });
  it("marks revoked Page access for reconnect and never sends video bytes", async () => {
    vi.mocked(verifyFacebookPage).mockRejectedValueOnce(new FacebookError("reconnect", "Reconnect the same Page"));
    await runFacebookPost(database(), post.id, prepare); expect(linked.status).toBe("reconnect"); expect(post.lease_token).toBeNull(); expect(prepare).not.toHaveBeenCalled();
  });
  it("waits after a lost upload response without repeating the uncertain transfer", async () => {
    remote.status.uploading_phase = { status: "in_progress" };
    vi.mocked(uploadFacebookReel).mockRejectedValueOnce(new FacebookError("unavailable", "Transfer result unknown"));
    await runFacebookPost(database(), post.id, prepare); await runFacebookPost(database(), post.id, prepare);
    expect(uploadFacebookReel).toHaveBeenCalledOnce(); expect(post.status).toBe("processing"); expect(finishFacebookReel).not.toHaveBeenCalled();
    remote.status.uploading_phase = { status: "complete" }; await runFacebookPost(database(), post.id, prepare);
    expect(finishFacebookReel).toHaveBeenCalledOnce(); expect(post.status).toBe("published");
  });
  it("requires an exclusive lease and honors the kill switch while allowing reconciliation", async () => {
    claimed = false; await runFacebookPost(database(), post.id, prepare); expect(verifyFacebookPage).not.toHaveBeenCalled();
    claimed = true; vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "false"); await runFacebookPost(database(), post.id, prepare);
    expect(post.status).toBe("needs_attention"); expect(verifyFacebookPage).not.toHaveBeenCalled();
    post.video_id = "444"; post.upload_started_at = post.created_at; post.finish_started_at = post.created_at; remote.status.publishing_phase = { status: "complete" };
    await runFacebookPost(database(), post.id, prepare); expect(post.status).toBe("published"); expect(finishFacebookReel).not.toHaveBeenCalled();
  });
});
