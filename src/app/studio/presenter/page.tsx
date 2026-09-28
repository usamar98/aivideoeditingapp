import { redirect } from "next/navigation";
import { getViewer, createClient } from "@/lib/supabase/server";
import { listPresenters } from "@/lib/presenter/repository";
import type { PresenterView } from "@/lib/presenter/schema";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { PresenterStudio } from "@/components/studio/presenter-studio";

export const metadata = { title: "AI Digital-Clone Presenter Studio", robots: { index: false, follow: false } };
export const maxDuration = 120;
export default async function PresenterPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1", viewer = preview ? null : await getViewer();
  if (!preview && !viewer) redirect("/login?next=/studio/presenter");
  const demo = preview || Boolean(viewer?.fixture);
  let presenters: PresenterView[] = [], projects: { id: string; title: string; status: string }[] = [], error: string | null = null;
  if (!demo && viewer) {
    try {
      const db = await createClient(); if (!db) throw new Error("Storage unavailable.");
      const [saved, videos] = await Promise.all([listPresenters(db, viewer.id), db.from("presenter_projects").select("id,title,status").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(30)]);
      if (videos.error) throw new Error("Presenter storage is not ready. Apply the digital-clone migration.");
      presenters = saved; projects = videos.data || [];
    } catch (cause) { error = cause instanceof Error ? cause.message : "Presenter storage unavailable."; }
  }
  return <WorkspaceShell title="Digital-clone presenter" active="Digital-clone presenter"><PresenterStudio demo={demo} presenters={presenters} projects={projects} initialError={error} /></WorkspaceShell>;
}
