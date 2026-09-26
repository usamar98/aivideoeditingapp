import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPost, SocialConnection, PostView } from "./types";

export async function connection(db: SupabaseClient, userId: string): Promise<SocialConnection | null> {
  const result = await db.from("social_connections").select("*").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("YouTube storage is unavailable. Apply the publishing migration.");
  return result.data;
}
export async function ownedPost(db: SupabaseClient, userId: string, id: string): Promise<SocialPost> {
  const result = await db.from("social_posts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (result.error || !result.data) throw new Error("Upload not found in your account.");
  return result.data;
}
export function postView(p: SocialPost): PostView {
  return { id: p.id, title: p.title, status: p.status, visibility: p.visibility, scheduled_at: p.scheduled_at, remote_privacy: p.remote_privacy, remote_publish_at: p.remote_publish_at,
    cancel_requested: p.cancel_requested, error_message: p.error_message, created_at: p.created_at, updated_at: p.updated_at, uploaded_bytes: p.uploaded_bytes, total_bytes: p.total_bytes,
    youtubeUrl: p.youtube_video_id && /^[\w-]{11}$/.test(p.youtube_video_id) ? `https://www.youtube.com/watch?v=${p.youtube_video_id}` : null };
}
