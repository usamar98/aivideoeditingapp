import { redirect } from "next/navigation";
import { createClient, getViewer } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FacelessCreator } from "@/components/studio/faceless-creator";

export const metadata = { title: "Faceless video generator", robots: { index: false, follow: false } };

export default async function FacelessPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/faceless");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [];
  if (!demo && viewer) {
    const db = await createClient();
    if (db) {
      const { data } = await db.from("faceless_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20);
      projects = data ?? [];
    }
  }
  return <WorkspaceShell title="Faceless video studio" active="Faceless videos"><FacelessCreator demo={demo} projects={projects} /></WorkspaceShell>;
}
