import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getEstateProject } from "@/lib/real-estate/repository";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { RealEstateProject } from "@/components/studio/real-estate-project";
export const metadata = { title: "Listing video", robots: { index: false, follow: false } };
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await getViewer(); if (!viewer || viewer.fixture) redirect("/login?next=/studio/real-estate");
  const db = await createClient(); if (!db) notFound();
  const project = await getEstateProject(db, viewer.id, id); if (!project) notFound();
  return <WorkspaceShell title={project.title} active="Real estate"><RealEstateProject project={project} /></WorkspaceShell>;
}
