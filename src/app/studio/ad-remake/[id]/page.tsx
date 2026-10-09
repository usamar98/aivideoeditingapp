import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getAdRemakeProject } from "@/lib/ad-remake/repository";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { AdRemakeReview } from "@/components/studio/ad-remake-review";
export const metadata = { title: "Review your Ad Remake", robots: { index: false, follow: false } };
export default async function AdRemakeProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await getViewer(); if (!viewer || viewer.fixture) redirect("/login?next=/studio/ad-remake");
  const db = await createClient(); if (!db) notFound();
  const project = await getAdRemakeProject(db, viewer.id, id); if (!project) notFound();
  return <WorkspaceShell title={project.title} active="Ad Remake"><AdRemakeReview project={project}/></WorkspaceShell>;
}
