import "server-only";
import { requireAccount } from "@/lib/account";
import { facebookConfigured, facebookPublishingEnabled } from "./facebook-config";
import { facebookConnection, facebookPostView, pendingFacebookGrant } from "./facebook-repository";
import { listVideos } from "./library";
import type { FacebookDashboardData, FacebookPost } from "./facebook-types";

export async function getFacebookDashboard(): Promise<FacebookDashboardData> {
  const { admin, user } = await requireAccount();
  const [linked, grant, videos, posts] = await Promise.all([facebookConnection(admin, user.id), pendingFacebookGrant(admin, user.id), listVideos(admin, user.id),
    admin.from("facebook_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)]);
  if (posts.error) throw new Error("Facebook publishing storage is not ready.");
  return { demo: false, configured: facebookConfigured(), publishingEnabled: facebookPublishingEnabled(), error: null,
    connection: linked ? { page_id: linked.page_id, page_name: linked.page_name, status: linked.status } : null,
    pages: grant?.pages.map((page) => ({ id: page.id, name: page.name })) || [], videos, posts: ((posts.data || []) as FacebookPost[]).map(facebookPostView) };
}
