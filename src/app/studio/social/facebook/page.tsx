import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { SocialPlatformTabs } from "@/components/studio/social-platform-tabs";
import { FacebookDashboard } from "@/components/studio/facebook-dashboard";
import { getViewer } from "@/lib/supabase/server";
import { getFacebookDashboard } from "@/lib/social/facebook-dashboard";
import type { FacebookDashboardData } from "@/lib/social/facebook-types";

export const metadata = { title: "Facebook Page publishing", robots: { index: false, follow: false } };
const notices: Record<string, string> = {
  choose_page: "Choose the Page you want ETA to publish to. Nothing has been posted.",
  denied: "Facebook connection cancelled. Nothing was posted.",
  no_pages: "No eligible Pages were returned. Use a Facebook account with permission to create content on a Page and allow all three requested permissions.",
  connection_failed: "Facebook could not connect. Try again, allow the requested permissions, and check the Meta app configuration if this continues.",
};
export default async function FacebookPage({ searchParams }: { searchParams: Promise<{ facebook?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio/social/facebook");
  const params = await searchParams;
  let initial: FacebookDashboardData = { demo: viewer.fixture, configured: false, publishingEnabled: false, error: null, connection: null, pages: [], videos: [], posts: [] };
  if (!viewer.fixture) {
    try { initial = await getFacebookDashboard(); }
    catch { initial.error = "Facebook storage is not ready. Apply the Facebook publishing migration and check the server configuration."; }
  }
  return <WorkspaceShell title="Publish & schedule" active="Publish & schedule"><SocialPlatformTabs active="facebook" /><FacebookDashboard initial={initial} notice={notices[params.facebook || ""] || null} /></WorkspaceShell>;
}
