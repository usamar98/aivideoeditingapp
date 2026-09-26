import "server-only";
import { requireAccount } from "@/lib/account";
import { listVideos } from "./library";
import { connection, postView } from "./repository";
import { youtubeConfigured, publicPublishingEnabled } from "./config";
import type { SocialDashboard, SocialPost } from "./types";

export async function getSocialDashboard(): Promise<SocialDashboard> {
  const { admin, user } = await requireAccount();
  const [linked, videos, posts] = await Promise.all([connection(admin, user.id), listVideos(admin, user.id), admin.from("social_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)]);
  if (posts.error) throw new Error("YouTube uploads could not be loaded. Check the publishing migration.");
  return { configured: youtubeConfigured(), publicPublishing: publicPublishingEnabled(), demo: false, error: null,
    connection: linked ? { channel_id: linked.channel_id, channel_title: linked.channel_title, status: linked.status } : null,
    videos, posts: ((posts.data || []) as SocialPost[]).map(postView) };
}
