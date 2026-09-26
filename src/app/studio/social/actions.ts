"use server";

import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount } from "@/lib/account";
import { publishSchema } from "@/lib/social/types";
import { publicPublishingEnabled, youtubeConfigured } from "@/lib/social/config";
import { resolveVideo } from "@/lib/social/library";
import { connection, ownedPost } from "@/lib/social/repository";
import { unseal } from "@/lib/social/crypto";
import { revokeToken, YouTubeError } from "@/lib/social/youtube";

async function dispatch(id: string, key: string) {
  await tasks.trigger("youtube-publish", { postId: id }, { concurrencyKey: id, idempotencyKey: key, idempotencyKeyTTL: "10m", ttl: "1h" });
}
function message(error: unknown) { return error instanceof YouTubeError ? error.message : error instanceof Error && !/token|fetch|secret|postgres|constraint/i.test(error.message) ? error.message : "The request could not be completed. Retry or contact support."; }

export async function publishToYouTube(input: unknown) {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the upload details." };
  try {
    if (!youtubeConfigured()) throw new Error("YouTube publishing is not configured yet.");
    if (!publicPublishingEnabled() && parsed.data.visibility !== "private") throw new Error("Only private test uploads are enabled until the YouTube API audit is complete.");
    const { admin, user } = await requireAccount();
    const source = await resolveVideo(admin, user.id, parsed.data.source);
    const result = await admin.rpc("enqueue_social_post", { owner_id: user.id, payload: { ...parsed.data, sourcePath: source.path } });
    if (result.error || !result.data) throw new Error(result.error?.code === "23505" ? "This video already has a YouTube upload. Use its existing upload card." : "Could not queue this video. Connect YouTube and keep fewer than ten pending uploads.");
    const id = String(result.data);
    try { await dispatch(id, `youtube-start:${id}`); }
    catch { return { id, warning: "Upload saved, but the worker could not be reached. Use Retry / refresh on its card; the recovery worker will also retry dispatch." }; }
    revalidatePath("/studio/social"); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function cancelYouTubePost(rawId: unknown) {
  const parsed = z.uuid().safeParse(rawId); if (!parsed.success) return { error: "Invalid upload." };
  try {
    const { admin, user } = await requireAccount(), post = await ownedPost(admin, user.id, parsed.data);
    if (post.status === "cancelled") return { success: true };
    if (["published", "private"].includes(post.status)) throw new Error("This upload is already complete. Manage its visibility directly in YouTube Studio.");
    const result = await admin.from("social_posts").update({ cancel_requested: true, status: "cancelling", next_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", post.id).eq("user_id", user.id).not("status", "in", "(published,private,cancelled)").select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Upload changed while cancelling. Refresh its status.");
    try { await dispatch(post.id, `youtube-cancel:${post.id}:${Math.floor(Date.now() / 60_000)}`); }
    catch { return { warning: "Cancellation is saved but not confirmed. Use Retry / refresh, or make the video private in YouTube Studio if its publication time is near." }; }
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function refreshYouTubePost(rawId: unknown) {
  const parsed = z.uuid().safeParse(rawId); if (!parsed.success) return { error: "Invalid upload." };
  try {
    const { admin, user } = await requireAccount(), post = await ownedPost(admin, user.id, parsed.data);
    const linked = await connection(admin, user.id);
    if (linked?.status !== "connected") throw new Error("Reconnect the same YouTube channel to retry.");
    if (post.status === "cancelled") return { success: true };
    await dispatch(post.id, `youtube-refresh:${post.id}:${Math.floor(Date.now() / 60_000)}`);
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function disconnectYouTube() {
  try {
    const { admin, user } = await requireAccount(), linked = await connection(admin, user.id);
    const check = await admin.rpc("begin_social_disconnect", { owner_id: user.id });
    if (check.error) throw new Error("An upload worker is active. Request cancellation and wait for it to stop, then retry disconnecting.");
    if (!linked) return { success: true };
    await revokeToken(unseal(linked.refresh_token, `youtube:${user.id}:${linked.channel_id}`));
    const removed = await admin.from("social_connections").delete().eq("id", linked.id).eq("user_id", user.id).eq("status", "disconnecting");
    if (removed.error) throw new Error("Google access was revoked, but local data removal needs a retry. Press Disconnect again.");
    const states = await admin.from("social_oauth_states").delete().eq("user_id", user.id);
    if (states.error) throw new Error("Connection removed; please retry to finish local cleanup.");
    revalidatePath("/studio/social"); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
