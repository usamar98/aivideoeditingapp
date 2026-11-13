import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getCartoonProject } from "@/lib/cartoons/repository";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { CartoonEditor } from "@/components/studio/cartoon-editor";

export const metadata = { title: "Direct your cartoon", robots: { index: false, follow: false } };
export default async function CartoonProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  if (id === "demo") {
    const aspectRatio = (await searchParams).format === "portrait" ? "9:16" : "16:9";
    const initial = { ...cartoonDemo, brief: { ...cartoonDemo.brief, aspectRatio } } as const;
    return <WorkspaceShell title="Cartoon studio · sample" active="Cartoon videos"><CartoonEditor key={aspectRatio} initial={initial} demo /></WorkspaceShell>;
  }
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await getViewer();
  if (!viewer || viewer.fixture) redirect(`/login?next=${encodeURIComponent(`/studio/cartoons/${id}`)}`);
  const db = await createClient(); if (!db) notFound();
  const project = await getCartoonProject(db, viewer.id, id); if (!project) notFound();
  if (project.brief.kind === "short-film") redirect(`/studio/films/${id}`);
  return <WorkspaceShell title="Cartoon studio" active="Cartoon videos"><CartoonEditor key={id} initial={project} demo={false} /></WorkspaceShell>;
}
