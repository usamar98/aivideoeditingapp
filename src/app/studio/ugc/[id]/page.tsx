import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, createClient } from "@/lib/supabase/server";
import { getUgcProject } from "@/lib/ugc/repository";
import { ugcDemo } from "@/lib/ugc/demo";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { UgcEditor } from "@/components/studio/ugc-editor";

export const metadata = { title: "Review & Render Your Product Ads", robots: { index: false, follow: false } };
export default async function UgcProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "demo") return <WorkspaceShell title="UGC & product ads · sample" active="UGC & product ads"><UgcEditor initial={ugcDemo} demo /></WorkspaceShell>;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await getViewer();
  if (!viewer || viewer.fixture) redirect(`/login?next=${encodeURIComponent(`/studio/ugc/${id}`)}`);
  const db = await createClient(); if (!db) notFound();
  const project = await getUgcProject(db, viewer.id, id); if (!project) notFound();
  return <WorkspaceShell title="UGC & product ads" active="UGC & product ads"><UgcEditor key={id} initial={project} demo={false} /></WorkspaceShell>;
}
