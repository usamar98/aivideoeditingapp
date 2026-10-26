import "server-only";
import { requireAccount } from "@/lib/account";
import { tiktokConfigured, tiktokPublishingEnabled, tiktokPublicPostingEnabled } from "./tiktok-config";
import { tiktokConnection, tiktokPostView, withTikTokToken } from "./tiktok-repository";
import { tiktokCreator, TikTokError } from "./tiktok";
import { listVideos } from "./library";
import type { TikTokDashboardData, TikTokPost } from "./tiktok-types";

export function emptyTikTokDashboard(demo = false): TikTokDashboardData {
  return { demo, configured: !demo && tiktokConfigured(), publishingEnabled: !demo && tiktokPublishingEnabled(), publicPosting: !demo && tiktokPublicPostingEnabled(), error: null, connection: null, creator: null, videos: [], posts: [] };
}
export async function getTikTokDashboard(): Promise<TikTokDashboardData> {
  const { admin, user } = await requireAccount(), data = emptyTikTokDashboard();
  // Safe to ship before applying the optional integration's migration/configuration.
  if (!data.configured) return data;
  const [linked, videos, posts] = await Promise.all([tiktokConnection(admin, user.id), listVideos(admin, user.id),
    admin.from("tiktok_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)]);
  if (posts.error) throw new Error("TikTok publishing storage is not ready.");
  data.connection = linked ? { display_name: linked.display_name, username: linked.username, status: linked.status } : null;
  data.videos = videos; data.posts = ((posts.data || []) as TikTokPost[]).map((post) => tiktokPostView(post, linked?.username));
  if (linked?.status === "connected") {
    try { data.creator = await withTikTokToken(admin, user.id, (token) => tiktokCreator(token)); }
    catch (error) { data.error = error instanceof TikTokError ? error.message : "TikTok creator settings could not be refreshed. Publishing is paused."; }
  }
  return data;
}
