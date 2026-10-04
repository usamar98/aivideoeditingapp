import { redirect } from "next/navigation";
import { getViewer, createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { RealEstateStudio } from "@/components/studio/real-estate-studio";
export const metadata = { title: "Real Estate Video Studio", robots: { index: false, follow: false } };
export default async function RealEstatePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1", viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/real-estate");
  const demo = preview || Boolean(viewer?.fixture); let projects: { id: string; title: string; status: string }[] = [], error: string | null = null;
  if (!demo && viewer) {
    const db = await createClient();
    const result = db ? await db.from("real_estate_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(30) : null;
    if (!result || result.error) error = "Listing storage is not ready. Apply the real-estate migration before creating a project.";
    else projects = result.data || [];
  }
  return <WorkspaceShell title="Real estate" active="Real estate"><RealEstateStudio demo={demo} projects={projects} initialError={error} /></WorkspaceShell>;
}
