"use server";

import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount } from "@/lib/account";
import { unseal } from "@/lib/social/crypto";
import { tiktokConfigured, tiktokPublishingEnabled, tiktokPublicPostingEnabled } from "@/lib/social/tiktok-config";
import { tiktokPublishSchema, validateTikTokCreatorChoice } from "@/lib/social/tiktok-types";
import { ownedTikTokPost, tiktokConnection, withTikTokToken } from "@/lib/social/tiktok-repository";
import { revokeTikTokToken, TikTokError, tiktokCreator, tiktokTokensSchema } from "@/lib/social/tiktok";
import { resolveVideo } from "@/lib/social/library";

const path = "/studio/social/tiktok";
function message(error: unknown) { return error instanceof TikTokError ? error.message : "TikTok request stopped safely. Refresh your connection and check the post details."; }
async function dispatch(id: string) { await tasks.trigger("tiktok-publish", { postId: id }, { concurrencyKey: id, idempotencyKey: `tiktok:${id}:${Math.floor(Date.now() / 60_000)}`, idempotencyKeyTTL: "2m", ttl: "1h" }); }

export async function publishToTikTok(input: unknown) {
  const parsed = tiktokPublishSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the TikTok post details." };
  try {
    const { admin, user } = await requireAccount();
    if (!tiktokConfigured() || !tiktokPublishingEnabled()) return { error: "TikTok publishing has not been enabled by the operator yet." };
    const source = await resolveVideo(admin, user.id, parsed.data.source);
    const creator = await withTikTokToken(admin, user.id, (token) => tiktokCreator(token));
    try { validateTikTokCreatorChoice(parsed.data, creator, tiktokPublicPostingEnabled()); }
    catch { return { error: "TikTok creator settings changed, or unaudited posting requires a private account and Only me. Refresh and review your choices." }; }
    const result = await admin.rpc("enqueue_tiktok_post", { owner_id: user.id, payload: { ...parsed.data, sourcePath: source.path } });
    if (result.error || !result.data) return { error: result.error?.code === "23505" ? "This video already has a TikTok post. Use its existing post card." : "Could not queue this post. Connect TikTok and keep fewer than ten pending posts." };
    const id = String(result.data);
    if (!parsed.data.scheduledAt) {
      try { await dispatch(id); } catch { return { id, warning: "Saved. The worker could not be reached; recovery will retry, or use Check status." }; }
    }
    revalidatePath(path); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function cancelTikTokPost(raw: unknown) {
  const parsed = z.uuid().safeParse(raw); if (!parsed.success) return { error: "Invalid post." };
  try {
    const { admin, user } = await requireAccount();
    const result = await admin.rpc("cancel_tiktok_post", { owner_id: user.id, post_id: parsed.data });
    if (result.error) return { error: "Publication may have started. Manage this post directly in TikTok; cancellation here is no longer safe." };
    revalidatePath(path); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function refreshTikTokPost(raw: unknown) {
  const parsed = z.uuid().safeParse(raw); if (!parsed.success) return { error: "Invalid post." };
  try {
    const { admin, user } = await requireAccount(), post = await ownedTikTokPost(admin, user.id, parsed.data), linked = await tiktokConnection(admin, user.id);
    if (linked?.status !== "connected") return { error: "Reconnect the same TikTok account first." };
    if (!["published", "cancelled"].includes(post.status)) await dispatch(post.id);
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function disconnectTikTok() {
  try {
    const { admin, user } = await requireAccount();
    const begun = await admin.rpc("begin_tiktok_disconnect", { owner_id: user.id });
    if (begun.error) return { error: "A worker or connection refresh is active. Wait for it to stop, then disconnect. You can remove app access in TikTok immediately." };
    // Read AFTER taking the disconnect fence: a recent refresh may have rotated tokens.
    const linked = await tiktokConnection(admin, user.id);
    let warning: string | undefined;
    if (linked) {
      try {
        const tokens = tiktokTokensSchema.parse(JSON.parse(unseal(linked.tokens, `tiktok:${user.id}:${linked.open_id}`)));
        await revokeTikTokToken(tokens.accessToken);
      } catch { warning = "Local access removed. Also remove Create AI Videos in TikTok → Settings and privacy → Security & permissions → Apps and services permissions; remote revocation was not confirmed."; }
      const removed = await admin.from("tiktok_connections").delete().eq("id", linked.id).eq("user_id", user.id).eq("status", "disconnecting");
      if (removed.error) return { error: "Access is paused, but local removal needs a retry. Press Disconnect again." };
    }
    revalidatePath(path); return { success: true, warning };
  } catch (error) { return { error: message(error) }; }
}
