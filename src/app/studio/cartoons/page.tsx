import { redirect } from "next/navigation";
import { createClient, getViewer } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { CartoonCreator } from "@/components/studio/cartoon-creator";

export const metadata = { title: "AI Cartoon Studio", robots: { index: false, follow: false } };
export default async function CartoonsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/cartoons");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [], initialError: string | null = null;
  if (!demo && viewer) {
    const db = await createClient();
    const result = await db!.from("cartoon_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(24);
    projects = result.data || []; if (result.error) initialError = "Cartoon storage is not ready. Apply the cartoon-studio migration to enable saved projects.";
  }
  return <WorkspaceShell title="Cartoon studio" active="Cartoon videos"><CartoonCreator demo={demo} seedanceEnabled={process.env.CARTOON_SEEDANCE_ENABLED === "true"} projects={projects} initialError={initialError} /></WorkspaceShell>;
}
