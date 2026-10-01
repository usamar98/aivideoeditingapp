"use server";

import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount } from "@/lib/account";
import { seal, unseal } from "@/lib/social/crypto";
import { facebookConfigured, facebookPublishingEnabled } from "@/lib/social/facebook-config";
import { facebookPublishSchema } from "@/lib/social/facebook-types";
import { facebookConnection, ownedFacebookPost, pendingFacebookGrant } from "@/lib/social/facebook-repository";
import { FacebookError, revokeFacebookGrant, verifyFacebookPage } from "@/lib/social/facebook";
import { resolveVideo } from "@/lib/social/library";

const path = "/studio/social/facebook";
function message(error: unknown) { return error instanceof FacebookError ? error.message : error instanceof Error && !/token|fetch|secret|postgres|constraint/i.test(error.message) ? error.message : "Facebook request could not be completed. Please retry."; }
async function dispatch(id: string) { await tasks.trigger("facebook-publish", { postId: id }, { concurrencyKey: id, idempotencyKey: `facebook:${id}:${Math.floor(Date.now() / 60_000)}`, idempotencyKeyTTL: "2m", ttl: "1h" }); }

export async function selectFacebookPage(raw: unknown) {
  const parsed = z.string().regex(/^\d{1,40}$/).safeParse(raw); if (!parsed.success) return { error: "Choose a Facebook Page." };
  try {
    const { admin, user } = await requireAccount(), grant = await pendingFacebookGrant(admin, user.id);
    const page = grant?.pages.find((item) => item.id === parsed.data);
    if (!grant || !page) throw new Error("Page selection expired. Connect Facebook again.");
    await verifyFacebookPage(page.access_token, page.id);
    const result = await admin.rpc("complete_facebook_oauth", { owner_id: user.id, state_digest: grant.state, remote_user: grant.userId, page: page.id, title: page.name,
      encrypted_user_token: seal(grant.token, `facebook-user:${user.id}:${grant.userId}`), encrypted_page_token: seal(page.access_token, `facebook-page:${user.id}:${page.id}`) });
    if (result.error) throw new Error("Could not select this Page. Reconnect the original Page, or disconnect first to change accounts. Wait for any active worker to stop.");
    revalidatePath(path); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function publishToFacebook(input: unknown) {
  const parsed = facebookPublishSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the Reel details." };
  try {
    if (!facebookConfigured() || !facebookPublishingEnabled()) throw new Error("Facebook publishing has not been enabled by the operator yet.");
    const { admin, user } = await requireAccount(), source = await resolveVideo(admin, user.id, parsed.data.source);
    const result = await admin.rpc("enqueue_facebook_post", { owner_id: user.id, payload: { ...parsed.data, sourcePath: source.path } });
    if (result.error || !result.data) throw new Error(result.error?.code === "23505" ? "This video already has a Facebook post. Use the existing post card." : "Could not queue the Reel. Connect your Page and keep fewer than ten pending posts.");
    const id = String(result.data);
    // Schedules are persisted before dispatch; recovery handles due schedules without expiring delayed runs.
    if (!parsed.data.scheduledAt) {
      try { await dispatch(id); } catch { return { id, warning: "Saved, but the worker could not be reached. Recovery will retry; you can also use Check status." }; }
    }
    revalidatePath(path); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function cancelFacebookPost(raw: unknown) {
  const parsed = z.uuid().safeParse(raw); if (!parsed.success) return { error: "Invalid post." };
  try {
    const { admin, user } = await requireAccount();
    const result = await admin.rpc("cancel_facebook_post", { owner_id: user.id, post_id: parsed.data });
    if (result.error) throw new Error("Cannot cancel: publication may have started. Refresh and manage the Reel in Meta Business Suite.");
    revalidatePath(path); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function refreshFacebookPost(raw: unknown) {
  const parsed = z.uuid().safeParse(raw); if (!parsed.success) return { error: "Invalid post." };
  try {
    const { admin, user } = await requireAccount(), post = await ownedFacebookPost(admin, user.id, parsed.data), linked = await facebookConnection(admin, user.id);
    if (linked?.status !== "connected") throw new Error("Reconnect the same Facebook Page first.");
    if (!["published", "cancelled"].includes(post.status)) await dispatch(post.id);
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function disconnectFacebook() {
  try {
    const { admin, user } = await requireAccount(), linked = await facebookConnection(admin, user.id);
    const begun = await admin.rpc("begin_facebook_disconnect", { owner_id: user.id });
    if (begun.error) throw new Error("A worker is active. Cancel queued work and wait for it to stop, then disconnect. You can revoke access in Facebook immediately.");
    let warning: string | undefined;
    if (linked) {
      try { await revokeFacebookGrant(unseal(linked.user_token, `facebook-user:${user.id}:${linked.facebook_user_id}`)); }
      catch { warning = "Local access removed. Facebook revocation was not confirmed; also remove ETA under Facebook Settings → Business integrations."; }
      const result = await admin.from("facebook_connections").delete().eq("id", linked.id).eq("user_id", user.id).eq("status", "disconnecting");
      if (result.error) throw new Error("Access is paused, but local removal needs a retry. Press Disconnect again.");
    }
    revalidatePath(path); return { success: true, warning };
  } catch (error) { return { error: message(error) }; }
}
