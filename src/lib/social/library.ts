import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryVideo, VideoSource } from "./types";

const tables = { faceless: "faceless_projects", cartoon: "cartoon_projects", ugc: "ugc_projects", shorts: "shorts_projects" } as const;
export function ownedOutputPath(path: unknown, workspaceId: string, userId: string): path is string {
  return typeof path === "string" && path.startsWith(`${workspaceId}/${userId}/`) && path.endsWith(".mp4") && !/[\\%\u0000-\u001f]/.test(path) && !path.split("/").some((part) => part === "." || part === ".." || !part) && path.length < 1024;
}
export async function resolveVideo(db: SupabaseClient, userId: string, source: VideoSource) {
  const multi = source.kind === "ugc" || source.kind === "shorts";
  const { data, error } = await db.from(tables[source.kind]).select(`id,title,user_id,workspace_id,status,${multi ? "outputs" : "output_path"}`).eq("id", source.projectId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("This completed video is not available in your account.");
  const row = data as unknown as { title: string; workspace_id: string; status: string; outputs?: Record<string, { videoPath?: string }>; output_path?: string };
  const path = multi ? row.outputs?.[source.outputKey]?.videoPath : row.status === "complete" ? row.output_path : null;
  if (!ownedOutputPath(path, row.workspace_id, userId) || (!multi && source.outputKey)) throw new Error("Choose a completed video owned by your account.");
  return { path, title: row.title };
}
export async function listVideos(db: SupabaseClient, userId: string): Promise<LibraryVideo[]> {
  const groups = await Promise.all((Object.keys(tables) as VideoSource["kind"][]).map(async (kind) => {
    const multi = kind === "ugc" || kind === "shorts";
    const { data, error } = await db.from(tables[kind]).select(`id,title,workspace_id,status,${multi ? "outputs" : "output_path"}`).eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("Completed videos could not be loaded.");
    const videos: LibraryVideo[] = [];
    for (const item of data || []) {
      const p = item as unknown as { id: string; title: string; status: string; workspace_id: string; output_path?: string; outputs?: Record<string, { videoPath?: string; title?: string; angle?: string }> };
      const href = `/studio/${kind === "cartoon" ? "cartoons" : kind}/${p.id}`;
      if (!multi && p.status === "complete" && ownedOutputPath(p.output_path, p.workspace_id, userId)) videos.push({ kind, projectId: p.id, outputKey: "", title: p.title, href });
      if (multi) for (const [key, output] of Object.entries(p.outputs || {})) {
        if (/^[\w-]{1,80}$/.test(key) && ownedOutputPath(output.videoPath, p.workspace_id, userId)) videos.push({ kind, projectId: p.id, outputKey: key, title: `${p.title} · ${output.title || output.angle || key}`, href });
      }
    }
    return videos;
  }));
  return groups.flat();
}
