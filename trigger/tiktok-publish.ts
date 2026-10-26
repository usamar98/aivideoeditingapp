import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { task, schedules, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { streamToFile } from "./media-io";
import { hash } from "../src/lib/social/crypto";
import { tiktokConfig, tiktokConfigured, tiktokPublishingEnabled, tiktokPublicPostingEnabled } from "../src/lib/social/tiktok-config";
import { tiktokConnection, withTikTokToken } from "../src/lib/social/tiktok-repository";
import { resolveVideo } from "../src/lib/social/library";
import { initTikTokPost, tiktokCreator, tiktokPostStatus, tiktokUser, TikTokError } from "../src/lib/social/tiktok";
import { validateTikTokCreatorChoice, validateTikTokMedia, type TikTokPost } from "../src/lib/social/tiktok-types";

const exec = promisify(execFile);
function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("TikTok worker database is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function prepareTikTokMedia(db: SupabaseClient, post: TikTokPost) {
  const source = await resolveVideo(db, post.user_id, { kind: post.source_kind, projectId: post.source_project_id, outputKey: post.source_output_key });
  if (source.path !== post.source_path) throw new TikTokError("rejected", "The export changed. Cancel this post and choose the current video.");
  const root = path.resolve(tmpdir()), folder = await mkdtemp(path.join(root, "cav-tiktok-"));
  try {
    const signal = AbortSignal.timeout(120_000), file = path.join(folder, "source.mp4");
    const result = await db.storage.from("private-media").download(post.source_path, {}, { signal }).asStream();
    if (result.error || !result.data) throw new TikTokError("unavailable", "Your completed video could not be downloaded.");
    await streamToFile(result.data, file, 200 * 1024 * 1024, signal);
    const probe = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-f", "mov", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate:stream_side_data=rotation", "-of", "json", "source.mp4"], { cwd: folder, timeout: 30_000, maxBuffer: 256 * 1024 });
    try { return validateTikTokMedia(JSON.parse(probe.stdout)); }
    catch { throw new TikTokError("rejected", "Re-export as a 9:16 H.264 MP4, 3–60 seconds, at least 540×960, 23–60 fps, with AAC audio if present."); }
  } finally {
    // Only the resolved, task-owned mkdtemp child may be recursively removed.
    const relative = path.relative(root, path.resolve(folder));
    if (relative.startsWith("cav-tiktok-") && !relative.includes(path.sep) && !path.isAbsolute(relative)) await rm(folder, { recursive: true, force: true });
  }
}
export async function runTikTokPost(db: SupabaseClient, id: string, prepare = prepareTikTokMedia) {
  const worker = randomUUID(), claimed = await db.rpc("claim_tiktok_post", { post_id: id, worker_token: worker });
  if (claimed.error) throw new Error("TikTok publishing lease is unavailable.");
  if (claimed.data !== true) return;
  async function current(): Promise<TikTokPost> {
    const result = await db.from("tiktok_posts").select("*").eq("id", id).eq("lease_token", worker).gt("lease_until", new Date(Date.now() + 65_000).toISOString()).maybeSingle();
    if (result.error || !result.data) throw new Error("TikTok lease expired or connection removed.");
    return result.data;
  }
  async function save(patch: Partial<TikTokPost>) {
    const result = await db.from("tiktok_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("lease_token", worker).gt("lease_until", new Date().toISOString()).neq("status", "cancelled").select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("TikTok checkpoint unavailable or work cancelled.");
  }
  async function reconcile(post: TikTokPost) {
    if (!post.publish_id) {
      await save({ status: "needs_attention", error_message: "TikTok may have accepted this post, but its ID was not saved. Check TikTok before posting again. Automatic resending is disabled." }); return;
    }
    const remote = await withTikTokToken(db, post.user_id, (token) => tiktokPostStatus(token, post.publish_id!));
    const complete = remote.status === "PUBLISH_COMPLETE", failed = remote.status === "FAILED" || remote.status === "SEND_TO_USER_INBOX";
    await save({ status: complete ? "published" : failed || post.attempts >= 15 ? "needs_attention" : "processing",
      public_post_id: complete ? remote.publicIds[0] || null : null, attempts: complete ? 0 : post.attempts + 1,
      next_check_at: new Date(Date.now() + 120_000).toISOString(),
      error_message: complete ? null : failed ? "TikTok could not confirm Direct Post publication. Check the existing post in TikTok; no replacement will be sent automatically." : post.attempts >= 15 ? "Processing is taking longer than expected. Check TikTok or use Check status to reconcile this existing post." : null });
  }
  const choices = (post: TikTokPost) => ({ caption: post.caption, privacy: post.privacy, allowComments: post.allow_comments, allowDuet: post.allow_duet,
    allowStitch: post.allow_stitch, brandOrganic: post.brand_organic, brandedContent: post.branded_content, syntheticMedia: post.synthetic_media });
  try {
    let post = await current();
    if (["published", "cancelled"].includes(post.status)) return;
    const linked = await tiktokConnection(db, post.user_id);
    if (!linked || linked.status !== "connected" || linked.id !== post.connection_id) throw new TikTokError("reconnect", "Reconnect the original TikTok account.");
    // A known init is ONLY reconciled. Neither recovery nor manual retry resends it.
    if (post.init_started_at) { await reconcile(post); return; }
    if (!tiktokPublishingEnabled()) throw new TikTokError("rejected", "TikTok publishing is paused. No publication was requested.");
    if (post.scheduled_at) {
      const delta = Date.parse(post.scheduled_at) - Date.now();
      if (delta > 0) { await save({ status: "scheduled", next_check_at: post.scheduled_at, error_message: null }); return; }
      if (delta < -15 * 60_000) throw new TikTokError("rejected", "The scheduled time was missed by more than 15 minutes. Cancel this post and choose another time.");
    }
    const media = await prepare(db, post);
    post = await current(); if (post.status === "cancelled") return;
    await withTikTokToken(db, post.user_id, async (token, account) => {
      if (account.id !== post.connection_id) throw new TikTokError("reconnect", "Reconnect the original TikTok account.");
      const identity = await tiktokUser(token);
      if (identity.open_id !== account.open_id) throw new TikTokError("reconnect", "TikTok account identity changed. Reconnect the original account.");
      const creator = await tiktokCreator(token);
      try { validateTikTokCreatorChoice(choices(post), creator, tiktokPublicPostingEnabled()); }
      catch { throw new TikTokError("rejected", "TikTok privacy or interaction settings changed, or unaudited access requires a private account and Only me. Cancel and review your settings."); }
      if (media.duration > creator.max_video_post_duration_sec) throw new TikTokError("rejected", "This video exceeds the connected creator's current TikTok duration limit.");
      post = await current(); if (post.status === "cancelled") return;
      if (!tiktokPublishingEnabled()) throw new TikTokError("rejected", "TikTok publishing was paused before publication.");
      if (post.scheduled_at && Date.parse(post.scheduled_at) < Date.now() - 15 * 60_000) throw new TikTokError("rejected", "Media preparation missed the schedule. Cancel and choose a later time.");
      // Token lease must cover the final bounded init call, even after a refresh.
      if (!account.token_lease_until || Date.parse(account.token_lease_until) < Date.now() + 25_000) throw new TikTokError("unavailable", "Connection refresh took too long. Check status to retry safely.");
      const ticket = randomBytes(32).toString("base64url"), url = new URL(`/api/social/tiktok/media/${post.id}`, tiktokConfig().origin);
      url.searchParams.set("ticket", ticket);
      const begun = await db.rpc("begin_tiktok_publish", { post_id: post.id, worker_token: worker, ticket_hash: hash(ticket), media_expiry: new Date(Date.now() + 2 * 3600_000).toISOString() });
      if (begun.error) throw new Error("Could not save publication intent.");
      if (begun.data !== true) return;
      post = await current(); if (post.status === "cancelled") return;
      const publishId = await initTikTokPost(token, choices(post), url.toString());
      await save({ publish_id: publishId, status: "processing", error_message: null, attempts: 0, next_check_at: new Date(Date.now() + 120_000).toISOString() });
    });
    post = await current(); if (post.init_started_at) await reconcile(post);
  } catch (error) {
    const result = await db.from("tiktok_posts").select("*").eq("id", id).eq("lease_token", worker).maybeSingle();
    if (result.error) throw new Error("TikTok recovery state unavailable.");
    const post = result.data as TikTokPost | null;
    if (post && !["cancelled", "published"].includes(post.status)) {
      const uncertain = post.init_started_at && !post.publish_id;
      const retry = !uncertain && error instanceof TikTokError && error.code === "unavailable" && post.attempts < 7;
      await save({ status: retry ? post.init_started_at ? "processing" : post.scheduled_at ? "scheduled" : "queued" : "needs_attention", attempts: post.attempts + 1, next_check_at: new Date(Date.now() + 120_000).toISOString(),
        error_message: uncertain ? "The publication response is uncertain. Check TikTok before posting again; automatic resending is disabled." : error instanceof TikTokError ? error.message : "TikTok publishing stopped safely. Check status or contact support with this post ID." });
    }
  } finally {
    const released = await db.from("tiktok_posts").update({ lease_token: null, lease_until: null }).eq("id", id).eq("lease_token", worker);
    if (released.error) throw new Error("TikTok lease release failed; it will expire automatically.");
  }
}
export const tiktokPublish = task({ id: "tiktok-publish", maxDuration: 600, machine: "small-1x", queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2 },
  run: async (payload: { postId: string }) => { const id = z.uuid().parse(payload.postId); await runTikTokPost(database(), id); return { postId: id }; },
});
export const tiktokRecovery = schedules.task({ id: "tiktok-publishing-recovery", cron: { pattern: "* * * * *", environments: ["PRODUCTION"] }, maxDuration: 120,
  run: async () => {
    if (!tiktokConfigured()) return { checked: 0 };
    const db = database(), now = new Date().toISOString();
    const expired = await db.from("tiktok_oauth_states").delete().lt("expires_at", now);
    const tickets = await db.from("tiktok_posts").update({ media_ticket_hash: null, media_expires_at: null }).lt("media_expires_at", now);
    if (expired.error || tickets.error) throw new Error("TikTok authorization cleanup failed.");
    // Unresolved publication records are retained to prevent duplicate posts.
    const pending = await db.from("tiktok_posts").select("id,tiktok_connections!inner(status)").in("status", ["queued", "scheduled", "publishing", "processing"]).eq("tiktok_connections.status", "connected").lte("next_check_at", now).order("next_check_at").limit(100);
    if (pending.error) throw new Error("TikTok recovery queue unavailable.");
    for (const post of pending.data || []) await tasks.trigger("tiktok-publish", { postId: post.id }, { concurrencyKey: post.id, idempotencyKey: `tiktok-recovery:${post.id}:${Math.floor(Date.now() / 60_000)}`, idempotencyKeyTTL: "2m", ttl: "15m" });
    return { checked: pending.data?.length || 0 };
  },
});
