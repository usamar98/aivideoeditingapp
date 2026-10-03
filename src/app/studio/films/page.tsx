import { redirect } from "next/navigation";
import { createClient, getViewer } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FilmCreator } from "@/components/studio/film-creator";

export const metadata = { title: "AI Short Film Studio", robots: { index: false, follow: false } };
export default async function FilmsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/films");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [], initialError: string | null = null;
  if (!demo && viewer) {
    const db = await createClient();
    const result = await db!.from("cartoon_projects").select("id,title,status").eq("user_id",viewer.id).eq("brief->>kind","short-film").order("created_at",{ascending:false}).limit(24);
    projects = result.data || [];
    if (result.error) initialError = "Saved films are temporarily unavailable. Please try again.";
  }
  return <WorkspaceShell title="Short film studio" active="Short films"><FilmCreator demo={demo} projects={projects} initialError={initialError} /></WorkspaceShell>;
}
