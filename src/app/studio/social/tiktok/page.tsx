import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { SocialPlatformTabs } from "@/components/studio/social-platform-tabs";
import { TikTokDashboard } from "@/components/studio/tiktok-dashboard";
import { getViewer } from "@/lib/supabase/server";
import { emptyTikTokDashboard, getTikTokDashboard } from "@/lib/social/tiktok-dashboard";

export const metadata = { title: "TikTok publishing", description: "Connect your TikTok account, preview a completed video and manage your publishing queue.", robots: { index: false, follow: false }, openGraph: { title: "TikTok publishing | Create AI Videos", description: "Preview and publish your completed videos to TikTok.", url: "https://createaivideos.app/studio/social/tiktok" } };
export default async function TikTokPage({ searchParams }: { searchParams: Promise<{ tiktok?: string; tiktok_ref?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio/social/tiktok");
  const params = await searchParams;
  let initial = emptyTikTokDashboard(viewer.fixture);
  if (!viewer.fixture) {
    try { initial = await getTikTokDashboard(); }
    catch { initial.error = "TikTok storage is not ready. The operator must apply the TikTok publishing migration and check server configuration."; }
  }
  const reference = /^[a-f\d-]{36}$/.test(params.tiktok_ref || "") ? ` Support reference: ${params.tiktok_ref}.` : "";
  const notice = params.tiktok === "connected" ? "TikTok connected. Preview a video and review your choices before posting." : params.tiktok === "denied" ? "TikTok authorization was cancelled. No video was posted." : params.tiktok === "connection_failed" ? `TikTok connection could not be completed. Reconnect the original account and grant profile and video publishing access.${reference}` : null;
  return <WorkspaceShell title="Publish & schedule" active="Publish & schedule"><SocialPlatformTabs active="tiktok" /><TikTokDashboard initial={initial} notice={notice} /></WorkspaceShell>;
}
