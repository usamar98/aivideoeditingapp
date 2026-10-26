import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seal, unseal } from "./crypto";
import { refreshTikTokToken, TikTokError, tiktokTokensSchema, type TikTokTokens } from "./tiktok";
import { TIKTOK_SCOPES } from "./tiktok-config";
import type { TikTokConnection, TikTokPost, TikTokPostView } from "./tiktok-types";

export async function tiktokConnection(db: SupabaseClient, userId: string): Promise<TikTokConnection | null> {
  const result = await db.from("tiktok_connections").select("*").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("TikTok storage is not ready.");
  return result.data as TikTokConnection | null;
}
export async function ownedTikTokPost(db: SupabaseClient, userId: string, id: string): Promise<TikTokPost> {
  const result = await db.from("tiktok_posts").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (result.error || !result.data) throw new Error("TikTok post not found in your account.");
  return result.data as TikTokPost;
}
export function tiktokPostView(post: TikTokPost, username?: string): TikTokPostView {
  return { id: post.id, caption: post.caption, privacy: post.privacy, status: post.status, scheduled_at: post.scheduled_at,
    init_started_at: post.init_started_at, error_message: post.error_message, created_at: post.created_at,
    tiktokUrl: post.status === "published" && post.public_post_id && /^\d{1,40}$/.test(post.public_post_id) && username && /^[\w.]{1,100}$/.test(username) ? `https://www.tiktok.com/@${username}/video/${post.public_post_id}` : null };
}
// Serialize refresh-token rotation and token use against reconnect/disconnect.
// The callback must only make bounded provider calls, never download/render media.
export async function withTikTokToken<T>(db: SupabaseClient, userId: string, run: (token: string, linked: TikTokConnection) => Promise<T>): Promise<T> {
  const lease = randomUUID(), claim = await db.rpc("claim_tiktok_token", { owner_id: userId, worker_token: lease });
  if (claim.error || claim.data !== true) throw new TikTokError("unavailable", "TikTok is busy or needs reconnection. Wait a moment, then refresh.");
  let linked: TikTokConnection | null = null;
  try {
    linked = await tiktokConnection(db, userId);
    if (!linked || linked.status !== "connected" || linked.token_lease !== lease) throw new TikTokError("reconnect", "Reconnect your TikTok account.");
    const context = `tiktok:${userId}:${linked.open_id}`;
    let tokens: TikTokTokens;
    try { tokens = tiktokTokensSchema.parse(JSON.parse(unseal(linked.tokens, context))); }
    catch { throw new TikTokError("reconnect", "Stored TikTok access needs reconnection."); }
    if (tokens.openId !== linked.open_id || TIKTOK_SCOPES.some((scope) => !tokens.scopes.includes(scope)) || tokens.refreshExpiresAt <= Date.now()) throw new TikTokError("reconnect", "Reconnect the same TikTok account to renew access.");
    if (tokens.accessExpiresAt <= Date.now() + 60_000) {
      tokens = await refreshTikTokToken(tokens.refreshToken);
      if (tokens.openId !== linked.open_id) throw new TikTokError("reconnect", "TikTok account identity changed. Reconnect the original account.");
      const saved = await db.from("tiktok_connections").update({ tokens: seal(JSON.stringify(tokens), context), verified_at: new Date().toISOString() })
        .eq("id", linked.id).eq("user_id", userId).eq("status", "connected").eq("token_lease", lease).gt("token_lease_until", new Date().toISOString()).select("id").maybeSingle();
      if (saved.error || !saved.data) throw new TikTokError("reconnect", "TikTok renewed access but it could not be saved. Reconnect the same account.");
    }
    return await run(tokens.accessToken, linked);
  } catch (error) {
    if (error instanceof TikTokError && error.code === "reconnect") {
      await db.from("tiktok_connections").update({ status: "reconnect" }).eq("user_id", userId).eq("status", "connected").eq("token_lease", lease);
    }
    throw error;
  } finally {
    await db.from("tiktok_connections").update({ token_lease: null, token_lease_until: null }).eq("user_id", userId).eq("token_lease", lease);
  }
}
