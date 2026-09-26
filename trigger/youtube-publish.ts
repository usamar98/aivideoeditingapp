import { randomUUID } from "node:crypto";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { task, schedules, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { streamToFile } from "./media-io";
import { seal, unseal } from "../src/lib/social/crypto";
import { publicPublishingEnabled } from "../src/lib/social/config";
import { connection } from "../src/lib/social/repository";
import { resolveVideo } from "../src/lib/social/library";
import { channelForToken, getVideo, refreshAccess, revokeToken, setVisibility, startUpload, uploadPart, YouTubeError, type YouTubeVideo } from "../src/lib/social/youtube";
import type { SocialPost, PostStatus } from "../src/lib/social/types";

const CHUNK = 4 * 1024 * 1024, MAX_VIDEO = 200 * 1024 * 1024;
function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Publishing worker database configuration is missing.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function remoteStatus(video: YouTubeVideo, post: Pick<SocialPost, "visibility" | "scheduled_at">): PostStatus {
  if (["failed", "rejected", "deleted"].includes(video.status.uploadStatus || "") || video.processingDetails?.processingStatus === "failed") return "failed";
  if (video.status.uploadStatus !== "processed" && video.processingDetails?.processingStatus !== "succeeded") return "processing";
  if (["public", "unlisted"].includes(video.status.privacyStatus || "")) return "published";
  if (video.status.privacyStatus === "private" && video.status.publishAt) return "scheduled";
  return video.status.privacyStatus === "private" && post.visibility === "private" ? "private" : "needs_attention";
}

export async function runYouTubePost(db: SupabaseClient, postId: string) {
  const worker = randomUUID();
  const claimed = await db.rpc("claim_social_post", { post_id: postId, worker_token: worker });
  if (claimed.error) throw new Error("Publishing lease is unavailable. Check the migration.");
  if (!claimed.data) return;
  let folder: string | undefined;
  let post: SocialPost | undefined;
  async function current() {
    const result = await db.from("social_posts").select("*").eq("id", postId).eq("lease_token", worker).gt("lease_until", new Date(Date.now() + 65_000).toISOString()).maybeSingle();
    if (result.error || !result.data) throw new Error("Publishing lease expired.");
    post = result.data as SocialPost;
    return post;
  }
  async function checkpoint(patch: Partial<SocialPost>) {
    const result = await db.from("social_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", postId).eq("lease_token", worker).gt("lease_until", new Date().toISOString()).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Could not save the publishing checkpoint.");
  }
  async function outcome(snapshot: SocialPost, patch: Partial<SocialPost>) {
    // A late cancellation wins over a successful publication/status write.
    // Native schedules need a daily refresh, not a quota-consuming poll every five minutes.
    const checkAt = patch.status === "scheduled" && patch.remote_publish_at
      ? Math.max(Date.now() + 60_000, Math.min(Date.now() + 86400_000, Date.parse(patch.remote_publish_at) + 60_000))
      : Date.now() + 5 * 60_000;
    const result = await db.from("social_posts").update({ ...patch, updated_at: new Date().toISOString(), next_check_at: new Date(checkAt).toISOString() })
      .eq("id", postId).eq("lease_token", worker).eq("cancel_requested", snapshot.cancel_requested).select("id").maybeSingle();
    if (result.error) throw new Error("Could not record YouTube status.");
    return Boolean(result.data);
  }
  try {
    let p = await current();
    if (p.status === "cancelled") return;
    if (p.cancel_requested && !p.youtube_video_id && !p.upload_session) {
      await outcome(p, { status: "cancelled", error_message: null }); return;
    }
    const linked = await connection(db, p.user_id);
    if (!linked || linked.id !== p.connection_id || linked.status !== "connected") throw new YouTubeError("reconnect", "Reconnect the original YouTube channel before continuing.");
    const token = await refreshAccess(unseal(linked.refresh_token, `youtube:${p.user_id}:${linked.channel_id}`));
    const channel = await channelForToken(token);
    if (channel.id !== linked.channel_id) throw new YouTubeError("reconnect", "Reconnect the original YouTube channel before continuing.");
    const verified = await db.from("social_connections").update({ channel_title: channel.title, verified_at: new Date().toISOString() }).eq("id", linked.id).eq("refresh_token", linked.refresh_token);
    if (verified.error) throw new Error("Could not refresh channel details.");
    const verifyOwner = (video: YouTubeVideo) => { if (video.snippet.channelId !== linked.channel_id) throw new YouTubeError("rejected", "Video does not belong to the connected channel."); };
    async function cancel(snapshot: SocialPost) {
      if (snapshot.youtube_video_id) {
        const video = await getVideo(token, snapshot.youtube_video_id); verifyOwner(video);
        if (video.status.privacyStatus !== "private" || video.status.publishAt) {
          await current(); await setVisibility(token, video, "private", null);
        }
        const confirmed = await getVideo(token, video.id); verifyOwner(confirmed);
        if (confirmed.status.privacyStatus !== "private" || confirmed.status.publishAt) throw new YouTubeError("unavailable", "YouTube has not confirmed cancellation. Make the video private in YouTube Studio if its publication time is near.");
      }
      await outcome(snapshot, { status: "cancelled", remote_privacy: snapshot.youtube_video_id ? "private" : null, remote_publish_at: null, upload_session: null, error_message: null });
    }
    if (!p.youtube_video_id) {
      // Probe a persisted session first: a previous attempt may have finished its
      // final chunk before losing the response. Never open a second session.
      if (p.upload_session && p.total_bytes) {
        try {
          const progress = await uploadPart(token, unseal(p.upload_session, `upload:${p.id}`), p.total_bytes, 0);
          await checkpoint({ uploaded_bytes: progress.offset, youtube_video_id: progress.videoId }); p = await current();
        } catch (error) {
          // Without a video ID the worker has never set visibility or a schedule;
          // an expired/unfinished private-only upload cannot publish later.
          if (!(p.cancel_requested && error instanceof YouTubeError && error.code === "session")) throw error;
        }
      }
      if (p.cancel_requested) { await cancel(p); return; }
      if (!p.youtube_video_id) {
        if (!await outcome(p, { status: "uploading", error_message: null })) { await cancel(await current()); return; }
        const source = await resolveVideo(db, p.user_id, { kind: p.source_kind, projectId: p.source_project_id, outputKey: p.source_output_key });
        if (source.path !== p.source_path) throw new YouTubeError("rejected", "The source video has changed. Cancel this upload and select the current export.");
        folder = await mkdtemp(path.join(tmpdir(), "eta-youtube-"));
        const file = path.join(folder, "video.mp4"), downloadSignal = AbortSignal.timeout(120_000);
        const downloaded = await db.storage.from("private-media").download(p.source_path, {}, { signal: downloadSignal }).asStream();
        if (downloaded.error || !downloaded.data) throw new YouTubeError("unavailable", "The private video could not be downloaded. Retry this upload.");
        await streamToFile(downloaded.data, file, MAX_VIDEO, downloadSignal);
        const size = (await stat(file)).size;
        if (p.total_bytes && p.total_bytes !== size) throw new YouTubeError("rejected", "Source size changed. Cancel this upload before selecting another export.");
        p = await current(); if (p.cancel_requested) { await cancel(p); return; }
        if (!p.upload_session) {
          const session = await startUpload(token, size, { title: p.title, description: p.description, madeForKids: p.made_for_kids, syntheticMedia: p.synthetic_media });
          // Persist before sending any video bytes. An unpersisted empty session
          // cannot publish a video, while a persisted session is always resumed.
          await checkpoint({ upload_session: seal(session, `upload:${p.id}`), total_bytes: size });
          p = await current();
        }
        const session = unseal(p.upload_session!, `upload:${p.id}`), handle = await open(file, "r");
        try {
          let offset = p.uploaded_bytes;
          while (offset < size) {
            p = await current(); if (p.cancel_requested) { await cancel(p); return; }
            const bytes = Buffer.alloc(Math.min(CHUNK, size - offset));
            const read = await handle.read(bytes, 0, bytes.length, offset);
            if (read.bytesRead !== bytes.length) throw new Error("Source file truncated.");
            const progress = await uploadPart(token, session, size, offset, bytes);
            if (progress.offset <= offset) throw new YouTubeError("unavailable", "YouTube did not advance the upload. Retry from its saved checkpoint.");
            offset = progress.offset;
            await checkpoint({ uploaded_bytes: offset, youtube_video_id: progress.videoId });
            if (progress.videoId) break;
          }
        } finally { await handle.close(); }
        p = await current();
      }
    }
    if (p.cancel_requested) { await cancel(p); return; }
    if (!p.youtube_video_id) throw new YouTubeError("session", "YouTube did not confirm upload completion. Retry this same upload.");
    let video = await getVideo(token, p.youtube_video_id); verifyOwner(video);
    const state = remoteStatus(video, p);
    if (state === "failed") { await outcome(p, { status: "failed", error_message: "YouTube rejected or could not process this video. Review it in YouTube Studio.", upload_session: null }); return; }
    if (state === "processing") { await outcome(p, { status: "processing", error_message: null }); return; }
    // A visibility update may have succeeded remotely before its response/checkpoint
    // was lost. Reconcile that success instead of applying an elapsed schedule again.
    const alreadyApplied = p.scheduled_at
      ? video.status.privacyStatus === "public" || (video.status.privacyStatus === "private" && Boolean(video.status.publishAt) && Date.parse(video.status.publishAt!) === Date.parse(p.scheduled_at))
      : video.status.privacyStatus === p.visibility && !video.status.publishAt;
    if (!p.visibility_applied && alreadyApplied) { await checkpoint({ visibility_applied: true }); p = await current(); }
    if (!p.visibility_applied) {
      p = await current(); if (p.cancel_requested) { await cancel(p); return; }
      if (p.visibility !== "private" && !publicPublishingEnabled()) throw new YouTubeError("rejected", "Public publishing is not enabled for this app. Review the video’s current visibility in YouTube Studio.");
      if (p.scheduled_at && Date.parse(p.scheduled_at) < Date.now() + 60_000) throw new YouTubeError("rejected", "The selected publication time passed before ETA could confirm the schedule. Check YouTube Studio, then cancel this request and choose a later time if needed.");
      await setVisibility(token, video, p.scheduled_at ? "private" : p.visibility, p.scheduled_at);
      await checkpoint({ visibility_applied: true });
      video = await getVideo(token, video.id); verifyOwner(video);
    }
    p = await current(); if (p.cancel_requested) { await cancel(p); return; }
    const status = remoteStatus(video, p);
    const committed = await outcome(p, { status, remote_privacy: video.status.privacyStatus || null, remote_publish_at: video.status.publishAt || null,
      error_message: status === "needs_attention" ? "YouTube kept this video private. Check the app’s API audit or changes made in YouTube Studio." : null, upload_session: null, attempts: 0 });
    if (!committed) { p = await current(); if (p.cancel_requested) await cancel(p); }
  } catch (error) {
    if (post) {
      const latest = await current();
      const reconnect = error instanceof YouTubeError && error.code === "reconnect";
      if (reconnect) {
        const result = await db.from("social_connections").update({ status: "reconnect", revoked_at: new Date().toISOString() }).eq("id", latest.connection_id).eq("status", "connected");
        if (result.error) throw new Error("Could not record revoked YouTube access.");
      }
      const transient = error instanceof YouTubeError && ["unavailable", "quota"].includes(error.code);
      const next = latest.cancel_requested ? "cancelling" : transient && latest.attempts < 7 ? latest.youtube_video_id ? "processing" : "uploading" : "needs_attention";
      await outcome(latest, { status: next, attempts: latest.attempts + 1, error_message: error instanceof YouTubeError ? error.message : "Publishing stopped safely. Retry this upload or contact support with its ID." });
    } else throw new Error("Upload could not be loaded.");
  } finally {
    const released = await db.from("social_posts").update({ lease_token: null, lease_until: null }).eq("id", postId).eq("lease_token", worker);
    if (folder) await rm(folder, { recursive: true, force: true });
    if (released.error) throw new Error("Publishing lease could not be released; it will expire automatically.");
  }
}

export const youtubePublish = task({ id: "youtube-publish", maxDuration: 600, machine: "small-1x", queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 3 },
  run: async (payload: { postId: string }) => { const id = z.uuid().parse(payload.postId); await runYouTubePost(database(), id); return { postId: id }; },
});

export async function cleanupDisconnected(db: SupabaseClient) {
  const pending = await db.from("social_connections").select("id,user_id,channel_id,refresh_token,disconnect_requested_at").eq("status", "disconnecting").order("disconnect_requested_at").limit(3);
  if (pending.error) throw new Error("YouTube disconnect cleanup unavailable.");
  for (const linked of pending.data || []) {
    let revoked = false;
    try { await revokeToken(unseal(linked.refresh_token, `youtube:${linked.user_id}:${linked.channel_id}`)); revoked = true; }
    catch { /* Retry later without exposing credentials or retaining requested deletions indefinitely. */ }
    if (revoked || Date.parse(linked.disconnect_requested_at) < Date.now() - 6 * 86400_000) {
      const removed = await db.from("social_connections").delete().eq("id", linked.id).eq("status", "disconnecting");
      if (removed.error) throw new Error("YouTube disconnect data removal failed.");
    }
  }
}

export const youtubeRecovery = schedules.task({ id: "youtube-publishing-recovery", cron: { pattern: "*/5 * * * *", environments: ["PRODUCTION"] }, maxDuration: 600,
  run: async () => {
    const db = database(), now = new Date().toISOString();
    await cleanupDisconnected(db);
    const expired = await db.from("social_oauth_states").delete().lt("expires_at", now);
    if (expired.error) throw new Error("OAuth state cleanup failed.");
    const old = new Date(Date.now() - 29 * 86400_000).toISOString();
    // Remove stale Google API data within 30 days, including externally revoked grants.
    const revoked = await db.from("social_connections").delete().eq("status", "reconnect").lt("revoked_at", old);
    const idle = await db.from("social_connections").delete().eq("status", "connected").lt("verified_at", old);
    const history = await db.from("social_posts").delete().in("status", ["published", "private", "cancelled", "failed", "needs_attention"]).lt("updated_at", old).is("lease_token", null);
    if (revoked.error || idle.error || history.error) throw new Error("YouTube retention cleanup failed.");
    const pending = await db.from("social_posts").select("id,connection_id,social_connections!inner(status)").in("status", ["queued", "uploading", "processing", "scheduled", "cancelling"]).eq("social_connections.status", "connected").lte("next_check_at", now).order("next_check_at").limit(100);
    if (pending.error) throw new Error("Publishing recovery could not read pending jobs.");
    for (const post of pending.data || []) {
      await tasks.trigger("youtube-publish", { postId: post.id }, { concurrencyKey: post.id, idempotencyKey: `youtube-recover:${post.id}:${Math.floor(Date.now() / 300_000)}`, idempotencyKeyTTL: "10m", ttl: "1h" });
    }
    return { checked: pending.data?.length || 0 };
  },
});
