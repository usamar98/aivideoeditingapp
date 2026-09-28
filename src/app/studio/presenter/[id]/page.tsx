import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, createClient } from "@/lib/supabase/server";
import { getPresenterProject } from "@/lib/presenter/repository";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { PresenterProject } from "@/components/studio/presenter-project";

export const metadata = { title: "Your AI Presenter Video", robots: { index: false, follow: false } };
export default async function PresenterProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await getViewer();
  if (!viewer || viewer.fixture) redirect(`/login?next=${encodeURIComponent(`/studio/presenter/${id}`)}`);
  const db = await createClient(); if (!db) notFound();
  const project = await getPresenterProject(db, viewer.id, id); if (!project) notFound();
  return <WorkspaceShell title="Digital-clone presenter" active="Digital-clone presenter"><PresenterProject project={project} /></WorkspaceShell>;
}
