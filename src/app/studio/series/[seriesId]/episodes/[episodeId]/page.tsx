import { notFound, redirect } from "next/navigation";

import { StudioEditor } from "@/components/studio/studio-editor";
import { demoEpisode } from "@/lib/editor/demo";
import { getViewer } from "@/lib/supabase/server";

export default async function EpisodeEditorPage({ params }: { params: Promise<{ seriesId: string; episodeId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio");
  const { seriesId, episodeId } = await params;
  if (seriesId !== demoEpisode.seriesId || episodeId !== demoEpisode.id) notFound();
  return <StudioEditor initialEpisode={demoEpisode} viewerEmail={viewer.email} />;
}
