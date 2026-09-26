import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPost } from "@/lib/social/types";
import { seal } from "@/lib/social/crypto";

vi.mock("@trigger.dev/sdk", () => ({ task: (v: unknown) => v, schedules: { task: (v: unknown) => v }, tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/social/library", () => ({ resolveVideo: vi.fn() }));
vi.mock("@/lib/social/youtube", async (original) => ({ ...await original<object>(), refreshAccess: vi.fn(), revokeToken: vi.fn(), channelForToken: vi.fn(), getVideo: vi.fn(), setVisibility: vi.fn(), startUpload: vi.fn(), uploadPart: vi.fn() }));
import { channelForToken, getVideo, refreshAccess, revokeToken, setVisibility, startUpload, uploadPart, YouTubeError, type YouTubeVideo } from "@/lib/social/youtube";
import { resolveVideo } from "@/lib/social/library";
import { cleanupDisconnected, runYouTubePost } from "../trigger/youtube-publish";

type Row = Record<string, unknown>;
const channel = "UC" + "x".repeat(22), videoId = "abcdefghijk", session = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test";
let post: SocialPost, linked: Row, remote: YouTubeVideo, claimed: boolean, storageCalls: number;
function database(): SupabaseClient {
  function from(table: string) {
    let patch: Row | undefined;
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      select: () => query, update: (v: Row) => { patch = v; return query; },
      eq: (k: string, v: unknown) => { filters.push((row) => row[k] === v); return query; },
      gt: (k: string, v: string) => { filters.push((row) => String(row[k]) > v); return query; },
      maybeSingle: async () => execute(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
    };
    function execute() {
      const row: Row = table === "social_posts" ? post : linked;
      if (!filters.every((filter) => filter(row))) return { data: null, error: null };
      if (patch) Object.assign(row, patch);
      return { data: { ...row }, error: null };
    }
    return query;
  }
  return { from, rpc: async (_name: string, input: { worker_token: string }) => {
    if (!claimed) return { data: false, error: null };
    post.lease_token = input.worker_token; post.lease_until = new Date(Date.now() + 900_000).toISOString();
    return { data: true, error: null };
  }, storage: { from: () => ({ download: () => ({ asStream: async () => {
    storageCalls++; return { error: null, data: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100)); controller.close(); } }) };
  } }) }) } } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("YOUTUBE_PUBLIC_PUBLISHING_ENABLED", "true");
  claimed = true; storageCalls = 0;
  post = { id: randomUUID(), user_id: randomUUID(), connection_id: randomUUID(), source_kind: "shorts", source_project_id: randomUUID(), source_output_key: "clip-1", source_path: "owned/source.mp4", title: "Title", description: "Description", visibility: "private", scheduled_at: null, made_for_kids: false, synthetic_media: true, status: "queued", cancel_requested: false, youtube_video_id: null, remote_privacy: null, remote_publish_at: null, visibility_applied: false, upload_session: null, total_bytes: null, uploaded_bytes: 0, attempts: 0, lease_token: null, lease_until: null, error_message: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), next_check_at: new Date().toISOString() };
  linked = { id: post.connection_id, user_id: post.user_id, status: "connected", channel_id: channel, refresh_token: seal("fake-refresh", `youtube:${post.user_id}:${channel}`) };
  remote = { id: videoId, snippet: { channelId: channel }, status: { privacyStatus: "private", uploadStatus: "processed" } };
  vi.mocked(refreshAccess).mockResolvedValue("fake-access"); vi.mocked(channelForToken).mockResolvedValue({ id: channel, title: "Channel" });
  vi.mocked(resolveVideo).mockResolvedValue({ path: post.source_path, title: "Title" });
  vi.mocked(startUpload).mockResolvedValue(session);
  vi.mocked(uploadPart).mockResolvedValue({ offset: 100, videoId });
  vi.mocked(getVideo).mockImplementation(async () => structuredClone(remote));
  vi.mocked(setVisibility).mockImplementation(async (_token, _video, privacy, date) => { remote.status.privacyStatus = privacy; remote.status.publishAt = date || undefined; return structuredClone(remote); });
});
afterEach(() => vi.unstubAllEnvs());
describe("YouTube publishing worker", () => {
  it("streams an owned export, checkpoints the upload, and confirms private completion", async () => {
    await runYouTubePost(database(), post.id);
    expect(storageCalls).toBe(1); expect(startUpload).toHaveBeenCalledOnce(); expect(uploadPart).toHaveBeenCalledOnce();
    expect(post).toMatchObject({ status: "private", youtube_video_id: videoId, uploaded_bytes: 100, upload_session: null, visibility_applied: true, lease_token: null });
    expect(setVisibility).not.toHaveBeenCalled(); // Initial private upload already has the requested visibility.
  });
  it("probes a saved session after a lost final response without opening another upload", async () => {
    post.upload_session = seal(session, `upload:${post.id}`); post.total_bytes = 100;
    await runYouTubePost(database(), post.id);
    expect(uploadPart).toHaveBeenCalledWith("fake-access", session, 100, 0);
    expect(startUpload).not.toHaveBeenCalled(); expect(storageCalls).toBe(0); expect(post.status).toBe("private");
  });
  it("stops before any provider call when a never-started upload was cancelled", async () => {
    post.cancel_requested = true; await runYouTubePost(database(), post.id);
    expect(post.status).toBe("cancelled"); expect(refreshAccess).not.toHaveBeenCalled(); expect(startUpload).not.toHaveBeenCalled();
  });
  it("clears a native schedule and checks YouTube before confirming cancellation", async () => {
    post.youtube_video_id = videoId; post.cancel_requested = true; post.status = "cancelling";
    remote.status.publishAt = new Date(Date.now() + 3600_000).toISOString();
    await runYouTubePost(database(), post.id);
    expect(setVisibility).toHaveBeenCalledWith("fake-access", expect.anything(), "private", null);
    expect(post.status).toBe("cancelled"); expect(post.remote_publish_at).toBe(null);
  });
  it("does not falsely confirm cancellation when YouTube still reports a schedule", async () => {
    post.youtube_video_id = videoId; post.cancel_requested = true;
    remote.status.publishAt = new Date(Date.now() + 3600_000).toISOString();
    vi.mocked(setVisibility).mockResolvedValue(remote);
    await runYouTubePost(database(), post.id);
    expect(post.status).toBe("cancelling"); expect(post.error_message).toContain("not confirmed cancellation");
  });
  it("cancels a publication that races the final visibility update", async () => {
    post.youtube_video_id = videoId; post.visibility = "public";
    vi.mocked(setVisibility).mockImplementation(async (_t, _v, privacy) => { remote.status.privacyStatus = privacy; if (privacy === "public") { post.cancel_requested = true; post.status = "cancelling"; } return structuredClone(remote); });
    await runYouTubePost(database(), post.id);
    expect(post.status).toBe("cancelled"); expect(remote.status.privacyStatus).toBe("private"); expect(setVisibility).toHaveBeenCalledTimes(2);
  });
  it("uses YouTube's schedule only after processing and only for a future time", async () => {
    post.youtube_video_id = videoId; post.visibility = "public"; post.scheduled_at = new Date(Date.now() + 3600_000).toISOString();
    await runYouTubePost(database(), post.id);
    expect(setVisibility).toHaveBeenCalledWith("fake-access", expect.anything(), "private", post.scheduled_at); expect(post.status).toBe("scheduled");
  });
  it("reconciles a lost visibility-update response after the scheduled time", async () => {
    post.youtube_video_id = videoId; post.visibility = "public"; post.scheduled_at = new Date(Date.now() - 1000).toISOString();
    remote.status.privacyStatus = "public";
    await runYouTubePost(database(), post.id);
    expect(post.status).toBe("published"); expect(post.visibility_applied).toBe(true); expect(setVisibility).not.toHaveBeenCalled();
  });
  it("keeps late schedules and unapproved public requests private", async () => {
    post.youtube_video_id = videoId; post.visibility = "public"; post.scheduled_at = new Date(Date.now() - 1000).toISOString();
    await runYouTubePost(database(), post.id);
    expect(post.status).toBe("needs_attention"); expect(setVisibility).not.toHaveBeenCalled();
    post.scheduled_at = null; vi.stubEnv("YOUTUBE_PUBLIC_PUBLISHING_ENABLED", "false");
    await runYouTubePost(database(), post.id); expect(setVisibility).not.toHaveBeenCalled(); expect(post.error_message).toContain("not enabled");
  });
  it("waits for processing and rejects channel mismatches", async () => {
    post.youtube_video_id = videoId; remote.status.uploadStatus = "uploaded";
    await runYouTubePost(database(), post.id); expect(post.status).toBe("processing"); expect(setVisibility).not.toHaveBeenCalled();
    remote.snippet.channelId = "other"; await runYouTubePost(database(), post.id);
    expect(post.status).toBe("needs_attention"); expect(post.error_message).toContain("does not belong");
  });
  it("requires reconnect after revoked access, never logs raw provider errors, and releases its lease", async () => {
    vi.mocked(refreshAccess).mockRejectedValue(new YouTubeError("reconnect", "Reconnect the same channel."));
    await runYouTubePost(database(), post.id);
    expect(linked.status).toBe("reconnect"); expect(post.status).toBe("needs_attention"); expect(post.lease_token).toBe(null);
  });
  it("does not run without the exclusive database lease", async () => {
    claimed = false; await runYouTubePost(database(), post.id); expect(refreshAccess).not.toHaveBeenCalled();
  });
  it("does not retry an expired session by creating a duplicate video", async () => {
    post.upload_session = seal(session, `upload:${post.id}`); post.total_bytes = 100;
    vi.mocked(uploadPart).mockRejectedValue(new YouTubeError("session", "Session expired; check YouTube Studio."));
    await runYouTubePost(database(), post.id);
    expect(post.status).toBe("needs_attention"); expect(startUpload).not.toHaveBeenCalled();
  });
  it("retries interrupted disconnects and bounds deletion retention even if Google stays unavailable", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const row = { ...linked, disconnect_requested_at: new Date().toISOString() };
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [row] }) }) }) }), delete: () => ({ eq: () => ({ eq: remove }) }) }) } as unknown as SupabaseClient;
    vi.mocked(revokeToken).mockRejectedValue(new Error("temporary outage"));
    await cleanupDisconnected(db); expect(remove).not.toHaveBeenCalled();
    vi.mocked(revokeToken).mockResolvedValue(undefined);
    await cleanupDisconnected(db); expect(remove).toHaveBeenCalledOnce();
    remove.mockClear(); vi.mocked(revokeToken).mockRejectedValue(new Error("still unavailable"));
    row.disconnect_requested_at = new Date(Date.now() - 7 * 86400_000).toISOString();
    await cleanupDisconnected(db); expect(remove).toHaveBeenCalledOnce();
  });
});
