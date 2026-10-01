import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { YouTubeDashboard } from "@/components/studio/youtube-dashboard";
import { SocialPlatformTabs } from "@/components/studio/social-platform-tabs";
import { getViewer } from "@/lib/supabase/server";
import { getSocialDashboard } from "@/lib/social/dashboard";
import type { SocialDashboard } from "@/lib/social/types";

export const metadata = { title: "YouTube publishing", robots: { index: false, follow: false } };
const notices: Record<string, string> = {
  connected: "YouTube connected. Review your channel and video details before uploading.", denied: "YouTube connection was cancelled. Nothing was uploaded.",
  permissions: "Allow the requested YouTube video permission and offline access, then reconnect.", different_channel: "Reconnect the original channel. To switch channels, cancel pending posts and disconnect first.",
  connection_failed: "YouTube could not connect. The link may have expired, or your Google account may not have a channel. Try again and check the setup guide if it continues.",
};
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ youtube?: string }> }) {
  const viewer = await getViewer(); if (!viewer) redirect("/login?next=/studio/social");
  const params = await searchParams;
  let initial: SocialDashboard = { configured: false, publicPublishing: false, demo: viewer.fixture, error: null, connection: null, videos: [], posts: [] };
  if (!viewer.fixture) { try { initial = await getSocialDashboard(); } catch { initial.error = "YouTube storage is not ready. Apply the publishing migration and check your server configuration."; } }
  return <WorkspaceShell title="Publish & schedule" active="Publish & schedule"><SocialPlatformTabs active="youtube" /><YouTubeDashboard initial={initial} notice={notices[params.youtube || ""] || null} /></WorkspaceShell>;
}
