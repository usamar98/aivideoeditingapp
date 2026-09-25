import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortsBriefSchema, shortsAnalysisSchema, shortsPlanSchema, shortsOutputSchema, type ShortsProjectView } from "./schema";

export async function getShortsProject(db: SupabaseClient, userId: string, id: string): Promise<ShortsProjectView | null> {
  const { data: p, error } = await db.from("shorts_projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Shorts storage is unavailable. Check the migration.");
  if (!p) return null;
  const brief = shortsBriefSchema.parse(p.brief), prefix = `${p.workspace_id}/${userId}/`;
  async function sign(path: string | null, download = false) {
    if (!path || !path.startsWith(prefix) || path.includes("..")) return null;
    const result = await db.storage.from("private-media").createSignedUrl(path, 3600, download ? { download: true } : undefined);
    if (result.error) throw new Error("Preview unavailable. Refresh to renew your private links.");
    return result.data?.signedUrl || null;
  }
  const asset = await db.from("assets").select("storage_path").eq("id", brief.sourceAssetId).eq("workspace_id", p.workspace_id).eq("owner_id", userId).is("deleted_at", null).maybeSingle();
  const job = p.generation_id ? await db.from("generations").select("id,status,cancel_requested_at,settings").eq("id", p.generation_id).eq("requested_by", userId).maybeSingle() : { data: null, error: null };
  if (asset.error || job.error) throw new Error("Could not read Shorts progress.");
  const outputs: ShortsProjectView["outputs"] = [];
  for (const [clipId, output] of Object.entries(shortsOutputSchema.parse(p.outputs))) {
    const [videoUrl, downloadUrl, captionsUrl] = await Promise.all([sign(output.videoPath), sign(output.videoPath, true), sign(output.captionsPath, true)]);
    if (videoUrl && downloadUrl && captionsUrl) outputs.push({ id: clipId, title: output.title, videoUrl, downloadUrl, captionsUrl, framingNote: output.framingNote, start: output.start, end: output.end });
  }
  return { id, title: p.title, status: p.status, revision: p.revision, brief, plan: p.plan ? shortsPlanSchema.parse(p.plan) : null, analysis: p.analysis ? shortsAnalysisSchema.parse(p.analysis) : null,
    sourceUrl: await sign(asset.data?.storage_path || null), outputs, error: p.error_message,
    job: job.data ? { id: job.data.id, status: job.data.status, cancelRequested: Boolean(job.data.cancel_requested_at), phase: typeof job.data.settings?.phase === "string" ? job.data.settings.phase.slice(0, 150) : null } : null };
}
