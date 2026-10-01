import type { SupabaseClient } from "@supabase/supabase-js";
import { unseal } from "./crypto";
import { facebookGrantSchema } from "./facebook";
import type { FacebookConnection, FacebookPost, FacebookPostView } from "./facebook-types";

export async function facebookConnection(db: SupabaseClient, userId: string): Promise<FacebookConnection | null> {
  const result = await db.from("facebook_connections").select("*").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Facebook storage is unavailable. Apply its publishing migration.");
  return result.data;
}
export async function pendingFacebookGrant(db: SupabaseClient, userId: string) {
  const result = await db.from("facebook_oauth_states").select("state_hash,pending_grant").eq("user_id", userId).eq("consumed", true).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (result.error) throw new Error("Facebook authorization is unavailable.");
  return result.data?.pending_grant ? { state: result.data.state_hash as string, ...facebookGrantSchema.parse(JSON.parse(unseal(result.data.pending_grant, `facebook-grant:${userId}`))) } : null;
}
export async function ownedFacebookPost(db: SupabaseClient, ownerId: string, id: string): Promise<FacebookPost> {
  const result = await db.from("facebook_posts").select("*").eq("user_id", ownerId).eq("id", id).maybeSingle();
  if (result.error || !result.data) throw new Error("Facebook post not found in your account.");
  return result.data;
}
export function facebookPostView(post: FacebookPost): FacebookPostView {
  return { id: post.id, title: post.title, status: post.status, scheduled_at: post.scheduled_at, error_message: post.error_message,
    created_at: post.created_at, finish_started_at: post.finish_started_at,
    facebookUrl: post.video_id && /^\d{1,40}$/.test(post.video_id) && post.finish_started_at ? `https://www.facebook.com/reel/${post.video_id}` : null };
}
