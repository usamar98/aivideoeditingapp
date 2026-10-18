import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { AnimeStudio } from "@/components/studio/anime-studio";

export const metadata: Metadata = { title: "Anime Studio Preview", robots: { index: false, follow: false, noarchive: true } };

export default async function AnimePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  if (!preview && !await getViewer()) redirect("/login?next=/studio/anime");
  // Preview bypasses sign-in only for this fixed, browser-local prototype. No private records or paid actions are loaded.
  return <WorkspaceShell title="Anime Studio" active="Anime Studio"><AnimeStudio/></WorkspaceShell>;
}
