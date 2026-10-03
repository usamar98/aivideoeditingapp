import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getCartoonProject } from "@/lib/cartoons/repository";
import { filmDemo } from "@/lib/films/demo";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FilmEditor } from "@/components/studio/film-editor";

export const metadata = { title: "Direct your short film", robots: { index:false, follow:false } };
export default async function FilmPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  if (id === "demo") return <WorkspaceShell title="Short film studio · sample" active="Short films"><FilmEditor initial={filmDemo} demo /></WorkspaceShell>;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await getViewer();
  if (!viewer || viewer.fixture) redirect(`/login?next=${encodeURIComponent(`/studio/films/${id}`)}`);
  const db = await createClient(); if (!db) notFound();
  const project = await getCartoonProject(db,viewer.id,id);
  if (!project || project.brief.kind !== "short-film") notFound();
  return <WorkspaceShell title="Short film studio" active="Short films"><FilmEditor key={id} initial={project} demo={false} /></WorkspaceShell>;
}
