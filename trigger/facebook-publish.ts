import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { task, schedules, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { streamToFile } from "./media-io";
import { unseal } from "../src/lib/social/crypto";
import { facebookPublishingEnabled } from "../src/lib/social/facebook-config";
import { facebookConnection } from "../src/lib/social/facebook-repository";
import { resolveVideo } from "../src/lib/social/library";
import { createFacebookReel, uploadFacebookReel, facebookReelStatus, finishFacebookReel, verifyFacebookPage, FacebookError, type FacebookReelStatus } from "../src/lib/social/facebook";
import { validateFacebookMedia, type FacebookPost } from "../src/lib/social/facebook-types";

const exec = promisify(execFile);
function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Facebook worker database is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function facebookRemoteOutcome(remote: FacebookReelStatus) {
  const phases = remote.status;
  if ([phases.video_status, phases.uploading_phase?.status, phases.processing_phase?.status, phases.publishing_phase?.status].some((value) => value === "error" || value === "failed")) return "failed";
  if (phases.publishing_phase?.status === "complete") return "published";
  return "pending";
}
export async function prepareFacebookMedia(db: SupabaseClient, post: FacebookPost) {
  const source = await resolveVideo(db, post.user_id, { kind: post.source_kind, projectId: post.source_project_id, outputKey: post.source_output_key });
  if (source.path !== post.source_path) throw new FacebookError("rejected", "This export has changed. Cancel the post and select the current video.");
  const folder = await mkdtemp(path.join(tmpdir(), "eta-facebook-"));
  try {
    const signal = AbortSignal.timeout(120_000), file = path.join(folder, "source.mp4");
    const result = await db.storage.from("private-media").download(post.source_path, {}, { signal }).asStream();
    if (result.error || !result.data) throw new FacebookError("unavailable", "The completed video could not be downloaded.");
    await streamToFile(result.data, file, 200 * 1024 * 1024, signal);
    const probe = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-f", "mov", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate:stream_side_data=rotation", "-of", "json", "source.mp4"], { cwd: folder, timeout: 30_000, maxBuffer: 256 * 1024 });
    try { validateFacebookMedia(JSON.parse(probe.stdout)); }
    catch { throw new FacebookError("rejected", "This Reel needs a 9:16 H.264 MP4, 4–60 seconds, at least 540×960, 23–60 fps, and AAC audio if present. Re-export it first."); }
    const signed = await db.storage.from("private-media").createSignedUrl(source.path, 3600);
    if (signed.error || !signed.data?.signedUrl) throw new FacebookError("unavailable", "Could not prepare a temporary media link.");
    return signed.data.signedUrl;
  } finally { await rm(folder, { recursive: true, force: true }); }
}

export async function runFacebookPost(db: SupabaseClient, id: string, prepare = prepareFacebookMedia) {
  const worker = randomUUID(), claimed = await db.rpc("claim_facebook_post", { post_id: id, worker_token: worker });
  if (claimed.error) throw new Error("Facebook publishing lease is unavailable.");
  if (!claimed.data) return;
  async function current(): Promise<FacebookPost> {
    const result = await db.from("facebook_posts").select("*").eq("id", id).eq("lease_token", worker).gt("lease_until", new Date(Date.now() + 65_000).toISOString()).maybeSingle();
    if (result.error || !result.data) throw new Error("Facebook lease expired or connection removed.");
    return result.data;
  }
  async function save(patch: Partial<FacebookPost>) {
    const result = await db.from("facebook_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("lease_token", worker)
      .gt("lease_until", new Date().toISOString()).neq("status", "cancelled").select("id").maybeSingle();
    if (result.error) throw new Error("Facebook checkpoint could not be saved.");
    if (!result.data) throw new Error("Facebook work cancelled or disconnected.");
  }
  async function recordRemote(post: FacebookPost, remote: FacebookReelStatus) {
    const state = facebookRemoteOutcome(remote);
    await save({ status: state === "published" ? "published" : state === "failed" || post.attempts >= 15 ? "needs_attention" : "publishing",
      attempts: state === "published" ? 0 : post.attempts + 1, next_check_at: new Date(Date.now() + 120_000).toISOString(),
      error_message: state === "published" ? null : state === "failed" ? "Facebook could not process this Reel. Check Meta Business Suite; ETA will not create a replacement automatically." : post.attempts >= 15 ? "Publication is not confirmed. Check Meta Business Suite before creating another post. Check status only reconciles this existing Reel." : null });
  }
  try {
    let post = await current();
    if (["published", "cancelled"].includes(post.status)) return;
    // Reconciliation still works when publishing is disabled. It cannot create a new post.
    if (!post.finish_started_at && !facebookPublishingEnabled()) {
      await save({ status: "needs_attention", error_message: "Facebook publishing is paused by the operator. No publication was requested." }); return;
    }
    if (!post.finish_started_at && post.scheduled_at) {
      const delta = Date.parse(post.scheduled_at) - Date.now();
      if (delta > 0) { await save({ status: "scheduled", next_check_at: post.scheduled_at, error_message: null }); return; }
      if (delta < -15 * 60_000) { await save({ status: "needs_attention", error_message: "The scheduled time was missed by more than 15 minutes. ETA has not requested publication. Cancel and choose another time." }); return; }
    }
    const linked = await facebookConnection(db, post.user_id);
    if (!linked || linked.id !== post.connection_id || linked.status !== "connected") throw new FacebookError("reconnect", "Reconnect the original Facebook Page.");
    const token = unseal(linked.page_token, `facebook-page:${post.user_id}:${linked.page_id}`);
    await verifyFacebookPage(token, linked.page_id);
    const verified = await db.from("facebook_connections").update({ verified_at: new Date().toISOString() }).eq("id", linked.id).eq("page_token", linked.page_token);
    if (verified.error) throw new Error("Could not confirm Page access.");
    if (post.finish_started_at && post.video_id) { await recordRemote(post, await facebookReelStatus(token, post.video_id)); return; }

    if (!post.upload_started_at) {
      const signedUrl = await prepare(db, post);
      post = await current(); if (post.status === "cancelled") return;
      if (!post.video_id) {
        const videoId = await createFacebookReel(token, linked.page_id);
        // Persist the ID before sending any video. An orphaned empty session cannot publish.
        await save({ video_id: videoId, status: "uploading", error_message: null });
      }
      post = await current(); if (post.status === "cancelled") return;
      await save({ upload_started_at: new Date().toISOString(), status: "uploading" });
      await uploadFacebookReel(token, post.video_id!, signedUrl);
    }
    post = await current(); if (post.status === "cancelled") return;
    const remote = await facebookReelStatus(token, post.video_id!);
    if (facebookRemoteOutcome(remote) === "failed") throw new FacebookError("rejected", "Facebook rejected the media transfer. Cancel this attempt and check the source video.");
    if (remote.status.uploading_phase?.status !== "complete") {
      await save({ status: post.attempts >= 15 ? "needs_attention" : "processing", attempts: post.attempts + 1, next_check_at: new Date(Date.now() + 120_000).toISOString(),
        error_message: post.attempts >= 15 ? "Facebook has not confirmed transfer. Check Meta Business Suite. ETA will not resend an uncertain upload automatically." : null }); return;
    }
    post = await current(); if (post.status === "cancelled") return;
    if (!facebookPublishingEnabled()) throw new FacebookError("rejected", "Facebook publishing was paused before publication.");
    if (post.scheduled_at && Date.parse(post.scheduled_at) < Date.now() - 15 * 60_000) throw new FacebookError("rejected", "Media preparation missed the scheduled time. Cancel and choose a later time.");
    // Serializes cancellation against the irreversible provider request. Never replay
    // a finish call after a crash/timeout: status reconciliation is the only safe retry.
    const finishing = await db.rpc("begin_facebook_finish", { post_id: post.id, worker_token: worker });
    if (finishing.error) throw new Error("Could not record publication intent.");
    if (!finishing.data) return;
    // A signed deletion can cascade the row after the intent transaction.
    // Recheck before the irreversible request; never restore a removed connection.
    post = await current();
    const caption = post.synthetic_media ? `${post.description}${post.description ? "\n\n" : ""}AI-generated or digitally altered video.` : post.description;
    await finishFacebookReel(token, linked.page_id, post.video_id!, post.title, caption);
    post = await current(); await recordRemote(post, await facebookReelStatus(token, post.video_id!));
  } catch (error) {
    // A signed deauthorization/deletion callback can remove this row while a request
    // is in flight. Do not recreate records or publish after that boundary.
    const result = await db.from("facebook_posts").select("*").eq("id", id).eq("lease_token", worker).maybeSingle();
    if (result.error) throw new Error("Could not read Facebook recovery state.");
    const post = result.data as FacebookPost | null;
    if (post && post.status !== "cancelled") {
      if (error instanceof FacebookError && error.code === "reconnect") {
        const stopped = await db.from("facebook_connections").update({ status: "reconnect" }).eq("id", post.connection_id).eq("status", "connected");
        if (stopped.error) throw new Error("Could not record expired Page access.");
      }
      const transient = error instanceof FacebookError && error.code === "unavailable";
      await save({ status: (post.finish_started_at || transient) && post.attempts < 7 ? post.finish_started_at ? "publishing" : "processing" : "needs_attention",
        attempts: post.attempts + 1, next_check_at: new Date(Date.now() + 120_000).toISOString(),
        error_message: error instanceof FacebookError ? error.message : "Facebook publishing stopped safely. Check status or contact support with this post ID." });
    }
  } finally {
    const result = await db.from("facebook_posts").update({ lease_token: null, lease_until: null }).eq("id", id).eq("lease_token", worker);
    if (result.error) throw new Error("Facebook publishing lease release failed; it will expire automatically.");
  }
}

export const facebookPublish = task({ id: "facebook-publish", maxDuration: 600, machine: "small-1x", queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2 },
  run: async (payload: { postId: string }) => { const id = z.uuid().parse(payload.postId); await runFacebookPost(database(), id); return { postId: id }; },
});
export const facebookRecovery = schedules.task({ id: "facebook-publishing-recovery", cron: { pattern: "* * * * *", environments: ["PRODUCTION"] }, maxDuration: 120,
  run: async () => {
    const db = database(), now = new Date().toISOString();
    const expired = await db.from("facebook_oauth_states").delete().lt("expires_at", now);
    const receipts = await db.from("facebook_deletions").delete().lt("requested_at", new Date(Date.now() - 30 * 86400_000).toISOString());
    if (expired.error || receipts.error) throw new Error("Facebook authorization cleanup failed.");
    // Never delete unresolved publication records automatically: they prevent duplicates.
    const pending = await db.from("facebook_posts").select("id,facebook_connections!inner(status)")
      .in("status", ["queued", "scheduled", "uploading", "processing", "publishing"]).eq("facebook_connections.status", "connected")
      .lte("next_check_at", now).order("next_check_at").limit(100);
    if (pending.error) throw new Error("Facebook recovery queue is unavailable.");
    for (const post of pending.data || []) {
      await tasks.trigger("facebook-publish", { postId: post.id }, { concurrencyKey: post.id, idempotencyKey: `facebook-recovery:${post.id}:${Math.floor(Date.now() / 60_000)}`, idempotencyKeyTTL: "2m", ttl: "15m" });
    }
    return { checked: pending.data?.length || 0 };
  },
});
