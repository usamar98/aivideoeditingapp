import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, createClient } from "@/lib/supabase/server";
import { getShortsProject } from "@/lib/shorts/repository";
import { shortsDemo } from "@/lib/shorts/demo";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { ShortsEditor } from "@/components/studio/shorts-editor";

export const metadata = { title: "Review & Export Shorts", robots: { index: false, follow: false } };
export default async function ShortsProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "demo") return <WorkspaceShell title="Shorts studio" active="Podcast Shorts"><ShortsEditor initial={shortsDemo} demo /></WorkspaceShell>;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await getViewer(); if (!viewer || viewer.fixture) redirect(`/login?next=/studio/shorts/${id}`);
  const db = await createClient(); if (!db) notFound();
  const project = await getShortsProject(db, viewer.id, id); if (!project) notFound();
  return <WorkspaceShell title="Shorts studio" active="Podcast Shorts"><ShortsEditor initial={project} /></WorkspaceShell>;
}
