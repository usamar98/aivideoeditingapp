import { redirect } from "next/navigation";
import { createClient, getViewer } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { AdRemakeStudio } from "@/components/studio/ad-remake-studio";
export const metadata = { title: "Ad Remake Studio", robots: { index: false, follow: false } };
export default async function AdRemakePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1", viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/ad-remake");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [], initialError: string | null = null;
  if (!demo && viewer) {
    const db = await createClient(), result = await db!.from("ad_remake_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(24);
    projects = result.data || []; if (result.error) initialError = "Apply the Ad Remake migration to enable saved projects.";
  }
  return <WorkspaceShell title="Ad Remake" active="Ad Remake"><AdRemakeStudio demo={demo} projects={projects} initialError={initialError}/></WorkspaceShell>;
}
