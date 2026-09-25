import { redirect } from "next/navigation";
import { getViewer, createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { UgcCreator } from "@/components/studio/ugc-creator";

export const metadata = { title: "AI UGC & Product Ad Studio", robots: { index: false, follow: false } };
export const maxDuration = 120;
export default async function UgcPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/ugc");
  const demo = preview || Boolean(viewer?.fixture);
  let projects: { id: string; title: string; status: string }[] = [], initialError: string | null = null;
  if (!demo && viewer) {
    const db = await createClient();
    const result = await db!.from("ugc_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(24);
    projects = result.data || [];
    if (result.error) initialError = "Ad storage is not ready. Apply the UGC product-ads migration to enable saved projects.";
  }
  return <WorkspaceShell title="UGC & product ads" active="UGC & product ads"><UgcCreator demo={demo} projects={projects} initialError={initialError} /></WorkspaceShell>;
}
