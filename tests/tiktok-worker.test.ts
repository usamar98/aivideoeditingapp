import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TikTokConnection, TikTokPost } from "@/lib/social/tiktok-types";
import { seal, unseal } from "@/lib/social/crypto";
vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ task: (v: unknown) => v, schedules: { task: (v: unknown) => v }, tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/social/tiktok", async (original) => ({ ...await original<object>(), initTikTokPost: vi.fn(), tiktokPostStatus: vi.fn(), tiktokUser: vi.fn(), tiktokCreator: vi.fn(), refreshTikTokToken: vi.fn() }));
import { initTikTokPost, tiktokPostStatus, tiktokUser, tiktokCreator, refreshTikTokToken, TikTokError } from "@/lib/social/tiktok";
import { withTikTokToken, tiktokPostView } from "@/lib/social/tiktok-repository";
import { runTikTokPost } from "../trigger/tiktok-publish";

type Row = Record<string, unknown>;
let post: TikTokPost, linked: TikTokConnection, deleted: boolean, cancelAtInit: boolean, tokenBusy: boolean, postBusy: boolean, failedSave: boolean;
const prepare = vi.fn();
function tokens(patch: Row = {}) { return { accessToken: "access", refreshToken: "refresh", openId: "creator-id", scopes: ["user.info.basic", "video.publish"], accessExpiresAt: Date.now() + 3600_000, refreshExpiresAt: Date.now() + 86400_000, ...patch }; }
function encrypt(value: Row) { return seal(JSON.stringify(value), `tiktok:${post.user_id}:creator-id`); }
function database(): SupabaseClient {
  function from(table: string) {
    let patch: Row | undefined;
    const filters: ((row: Row) => boolean)[] = [];
    const query = { select: () => query, update: (v: Row) => { patch = v; return query; },
      eq: (k: string, v: unknown) => { filters.push((row) => row[k] === v); return query; }, neq: (k: string, v: unknown) => { filters.push((row) => row[k] !== v); return query; },
      gt: (k: string, v: string) => { filters.push((row) => String(row[k]) > v); return query; }, maybeSingle: async () => execute(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
    };
    function execute() {
      const row = (table === "tiktok_posts" ? post : linked) as unknown as Row;
      if (deleted || !filters.every((f) => f(row))) return { data: null, error: null };
      if (failedSave && patch?.publish_id) return { data: null, error: { message: "db down" } };
      if (patch) Object.assign(row, patch);
      return { data: { ...row }, error: null };
    }
    return query;
  }
  return { from, rpc: async (name: string, input: { worker_token: string; ticket_hash: string; media_expiry: string }) => {
    if (name === "claim_tiktok_token") {
      if (deleted || tokenBusy || linked.status !== "connected" || linked.token_lease) return { data: false, error: null };
      linked.token_lease = input.worker_token; linked.token_lease_until = new Date(Date.now() + 90_000).toISOString(); return { data: true, error: null };
    }
    if (name === "begin_tiktok_publish") {
      if (cancelAtInit) post.status = "cancelled";
      if (deleted || post.status === "cancelled" || post.init_started_at || post.lease_token !== input.worker_token) return { data: false, error: null };
      post.init_started_at = new Date().toISOString(); post.status = "publishing"; post.media_ticket_hash = input.ticket_hash; post.media_expires_at = input.media_expiry; return { data: true, error: null };
    }
    if (deleted || postBusy || linked.status !== "connected") return { data: false, error: null };
    post.lease_token = input.worker_token; post.lease_until = new Date(Date.now() + 900_000).toISOString(); return { data: true, error: null };
  } } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32)); vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "true"); vi.stubEnv("TIKTOK_PUBLIC_POSTING_ENABLED", "false"); vi.stubEnv("TIKTOK_CLIENT_KEY", "key"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "secret"); vi.stubEnv("TIKTOK_REDIRECT_URI", "https://createaivideos.app/api/social/tiktok/callback");
  deleted = false; cancelAtInit = false; tokenBusy = false; postBusy = false; failedSave = false;
  const now = new Date().toISOString();
  post = { id: randomUUID(), user_id: randomUUID(), connection_id: randomUUID(), source_kind: "shorts", source_project_id: randomUUID(), source_output_key: "clip-1", source_path: "owned/video.mp4", caption: "Caption", privacy: "SELF_ONLY", allow_comments: false, allow_duet: false, allow_stitch: false, commercial_content: false, brand_organic: false, branded_content: false, synthetic_media: true, scheduled_at: null, status: "queued", init_started_at: null, publish_id: null, public_post_id: null, media_ticket_hash: null, media_expires_at: null, attempts: 0, lease_token: null, lease_until: null, next_check_at: now, created_at: now, updated_at: now, error_message: null };
  linked = { id: post.connection_id, user_id: post.user_id, open_id: "creator-id", display_name: "Creator", username: "creator", status: "connected", token_lease: null, token_lease_until: null, tokens: encrypt(tokens()) };
  prepare.mockReset(); prepare.mockResolvedValue({ duration: 15 });
  vi.mocked(tiktokUser).mockResolvedValue({ open_id: "creator-id", display_name: "Creator" });
  vi.mocked(tiktokCreator).mockResolvedValue({ creator_username: "creator", creator_nickname: "Creator", privacy_level_options: ["SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 60 });
  vi.mocked(initTikTokPost).mockResolvedValue("publish-id"); vi.mocked(tiktokPostStatus).mockResolvedValue({ status: "PUBLISH_COMPLETE", publicIds: [] });
  vi.mocked(refreshTikTokToken).mockResolvedValue(tokens({ refreshToken: "rotated", accessToken: "renewed" }));
});
afterEach(() => vi.unstubAllEnvs());

describe("TikTok durable publication safety", () => {
  it("validates an export, saves intent/ticket hash, sends once and confirms private publication", async () => {
    await runTikTokPost(database(), post.id, prepare);
    expect(prepare).toHaveBeenCalledOnce(); expect(initTikTokPost).toHaveBeenCalledOnce(); expect(post.status).toBe("published"); expect(post.publish_id).toBe("publish-id"); expect(post.lease_token).toBeNull(); expect(linked.token_lease).toBeNull();
    const media = new URL(vi.mocked(initTikTokPost).mock.calls[0][2]); expect(media.origin).toBe("https://createaivideos.app"); expect(media.searchParams.get("ticket")).toHaveLength(43); expect(post.media_ticket_hash).not.toBe(media.searchParams.get("ticket"));
    expect(tiktokPostView(post, linked.username).tiktokUrl).toBeNull();
  });
  it("never reinitializes after a lost init response, including manual Check status", async () => {
    vi.mocked(initTikTokPost).mockRejectedValueOnce(new TikTokError("unavailable", "Response lost"));
    await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention"); expect(post.init_started_at).toBeTruthy(); expect(post.publish_id).toBeNull();
    await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).toHaveBeenCalledOnce(); expect(post.error_message).toContain("Automatic resending is disabled"); expect(tiktokPostStatus).not.toHaveBeenCalled();
  });
  it("never resends when the provider accepted but saving its ID failed", async () => {
    failedSave = true; await runTikTokPost(database(), post.id, prepare); failedSave = false; await runTikTokPost(database(), post.id, prepare);
    expect(initTikTokPost).toHaveBeenCalledOnce(); expect(post.status).toBe("needs_attention");
  });
  it("reconciles known requests even with the publishing kill switch off", async () => {
    post.init_started_at = post.created_at; post.publish_id = "existing"; vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "false");
    await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("published"); expect(initTikTokPost).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
  it("does not claim processing as publication and bounds recovery polling", async () => {
    vi.mocked(tiktokPostStatus).mockResolvedValue({ status: "PROCESSING_DOWNLOAD", publicIds: [] });
    await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("processing");
    post.attempts = 15; await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention"); expect(initTikTokPost).toHaveBeenCalledOnce();
  });
  it("handles remote failed/inbox-only outcomes without creating replacements", async () => {
    vi.mocked(tiktokPostStatus).mockResolvedValue({ status: "FAILED", publicIds: [] }); await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention");
    vi.mocked(tiktokPostStatus).mockResolvedValue({ status: "SEND_TO_USER_INBOX", publicIds: [] }); await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention"); expect(initTikTokPost).toHaveBeenCalledOnce();
  });
  it("honors cancellation/deletion during preparation and the atomic init fence", async () => {
    prepare.mockImplementationOnce(async () => { post.status = "cancelled"; return { duration: 15 }; }); await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).not.toHaveBeenCalled();
    post.status = "queued"; cancelAtInit = true; await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("cancelled"); expect(initTikTokPost).not.toHaveBeenCalled();
    post.status = "queued"; cancelAtInit = false; prepare.mockImplementationOnce(async () => { deleted = true; return { duration: 15 }; }); await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).not.toHaveBeenCalled();
  });
  it("leaves future schedules local, pauses missed starts, and respects exclusive leases/kill switch", async () => {
    postBusy = true; await runTikTokPost(database(), post.id, prepare); expect(prepare).not.toHaveBeenCalled(); postBusy = false;
    post.scheduled_at = new Date(Date.now() + 3600_000).toISOString(); await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("scheduled");
    post.scheduled_at = new Date(Date.now() - 3600_000).toISOString(); await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("needs_attention");
    post.scheduled_at = null; vi.stubEnv("TIKTOK_PUBLISHING_ENABLED", "false"); await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
  it("rechecks creator duration, privacy and interactions without silently changing settings", async () => {
    prepare.mockResolvedValueOnce({ duration: 61 }); await runTikTokPost(database(), post.id, prepare); expect(post.error_message).toContain("duration limit");
    vi.mocked(tiktokCreator).mockResolvedValueOnce({ creator_username: "creator", creator_nickname: "Creator", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 60 });
    await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).not.toHaveBeenCalled(); expect(post.privacy).toBe("SELF_ONLY");
    post.allow_duet = true; await runTikTokPost(database(), post.id, prepare); expect(initTikTokPost).not.toHaveBeenCalled();
  });
  it("rejects a different remote account and marks revoked permissions for reconnect", async () => {
    vi.mocked(tiktokUser).mockResolvedValueOnce({ open_id: "wrong", display_name: "Wrong" }); await runTikTokPost(database(), post.id, prepare); expect(linked.status).toBe("reconnect"); expect(initTikTokPost).not.toHaveBeenCalled();
  });
  it("keeps a pre-send transient failure queued rather than claiming TikTok is processing it", async () => {
    prepare.mockRejectedValueOnce(new TikTokError("unavailable", "Storage temporarily unavailable"));
    await runTikTokPost(database(), post.id, prepare); expect(post.status).toBe("queued"); expect(post.init_started_at).toBeNull(); expect(initTikTokPost).not.toHaveBeenCalled();
  });
});
describe("TikTok encrypted token rotation", () => {
  it("persists a rotated refresh token before use, returns no credentials and releases its lease", async () => {
    linked.tokens = encrypt(tokens({ accessExpiresAt: Date.now() - 1000 }));
    const run = vi.fn(async (access: string) => { expect(access).toBe("renewed"); const saved = JSON.parse(unseal(linked.tokens, `tiktok:${post.user_id}:creator-id`)); expect(saved.refreshToken).toBe("rotated"); return "done"; });
    expect(await withTikTokToken(database(), post.user_id, run)).toBe("done"); expect(refreshTikTokToken).toHaveBeenCalledWith("refresh"); expect(linked.token_lease).toBeNull();
  });
  it("blocks concurrent token use and detects tampering, wrong identity and refresh expiry", async () => {
    tokenBusy = true; await expect(withTikTokToken(database(), post.user_id, async () => true)).rejects.toThrow(/busy/); tokenBusy = false;
    for (const value of [tokens({ openId: "other" }), tokens({ refreshExpiresAt: Date.now() - 1000 })]) { linked.status = "connected"; linked.tokens = encrypt(value); await expect(withTikTokToken(database(), post.user_id, async () => true)).rejects.toMatchObject({ code: "reconnect" }); expect(linked.status).toBe("reconnect"); }
    linked.status = "connected"; linked.tokens = "broken"; await expect(withTikTokToken(database(), post.user_id, async () => true)).rejects.toMatchObject({ code: "reconnect" });
  });
  it("does not overwrite credentials with a different refresh identity or continue posting", async () => {
    linked.tokens = encrypt(tokens({ accessExpiresAt: Date.now() - 1000 })); const old = linked.tokens;
    vi.mocked(refreshTikTokToken).mockResolvedValueOnce(tokens({ openId: "wrong" })); const run = vi.fn();
    await expect(withTikTokToken(database(), post.user_id, run)).rejects.toMatchObject({ code: "reconnect" }); expect(run).not.toHaveBeenCalled(); expect(linked.tokens).toBe(old);
  });
});
