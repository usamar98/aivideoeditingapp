import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { SocialPlatformTabs } from "@/components/studio/social-platform-tabs";
import { FacebookDashboard } from "@/components/studio/facebook-dashboard";
import { getViewer } from "@/lib/supabase/server";
import { getFacebookDashboard } from "@/lib/social/facebook-dashboard";
import type { FacebookDashboardData } from "@/lib/social/facebook-types";
import { facebookOAuthNotice } from "@/lib/social/facebook-oauth-diagnostics";

export const metadata = { title: "Facebook Page publishing", robots: { index: false, follow: false } };
export default async function FacebookPage({ searchParams }: { searchParams: Promise<{ facebook?: string; facebook_ref?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio/social/facebook");
  const params = await searchParams;
  let initial: FacebookDashboardData = { demo: viewer.fixture, configured: false, publishingEnabled: false, error: null, connection: null, pages: [], videos: [], posts: [] };
  if (!viewer.fixture) {
    try { initial = await getFacebookDashboard(); }
    catch { initial.error = "Facebook storage is not ready. Apply the Facebook publishing migration and check the server configuration."; }
  }
  return <WorkspaceShell title="Publish & schedule" active="Publish & schedule"><SocialPlatformTabs active="facebook" /><FacebookDashboard initial={initial} notice={facebookOAuthNotice(params.facebook, params.facebook_ref)} /></WorkspaceShell>;
}
