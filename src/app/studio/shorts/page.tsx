import { redirect } from "next/navigation";
import { getViewer, createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { ShortsCreator } from "@/components/studio/shorts-creator";

export const metadata = { title: "Podcast & Video to Shorts Studio", robots: { index: false, follow: false } };
export default async function ShortsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1", viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/shorts");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [], initialError: string | null = null;
  if (!demo && viewer) {
    const db = await createClient();
    const result = await db!.from("shorts_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(24);
    projects = result.data || [];
    if (result.error) initialError = "Apply the podcast Shorts migration to enable saved projects.";
  }
  return <WorkspaceShell title="Podcast & video Shorts" active="Podcast Shorts"><ShortsCreator demo={demo} projects={projects} initialError={initialError} /></WorkspaceShell>;
}
