import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ugcBriefSchema, ugcPlanSchema, ugcOutputsSchema, type UgcProjectView } from "./schema";

export async function getUgcProject(db: SupabaseClient, userId: string, id: string): Promise<UgcProjectView | null> {
  const { data: project, error } = await db.from("ugc_projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Ad projects are unavailable. Check the UGC migration.");
  if (!project) return null;
  const brief = ugcBriefSchema.parse(project.brief);
  const prefix = `${project.workspace_id}/${userId}/`;
  async function sign(path: string | null) {
    if (!path || !path.startsWith(prefix) || path.includes("..")) return null;
    const { data, error } = await db.storage.from("private-media").createSignedUrl(path, 900);
    if (error) throw new Error("Private previews are unavailable. Refresh to retry.");
    return data?.signedUrl || null;
  }
  const [presenterUrl, assets, generation] = await Promise.all([
    sign(project.presenter_path),
    db.from("assets").select("id,storage_path").eq("owner_id", userId).eq("workspace_id", project.workspace_id).is("deleted_at", null).in("id", brief.productAssetIds),
    project.generation_id ? db.from("generations").select("id,status,cancel_requested_at,settings").eq("id", project.generation_id).eq("requested_by", userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (assets.error || generation.error) throw new Error("Could not read ad progress.");
  const productUrls = (await Promise.all(brief.productAssetIds.map((assetId) => sign(assets.data?.find((a) => a.id === assetId)?.storage_path || null)))).filter((url): url is string => Boolean(url));
  const outputs: UgcProjectView["outputs"] = [];
  for (const [id, output] of Object.entries(ugcOutputsSchema.parse(project.outputs))) {
    const [videoUrl, captionsUrl] = await Promise.all([sign(output.videoPath), sign(output.captionsPath)]);
    if (videoUrl && captionsUrl) outputs.push({ id, videoUrl, captionsUrl, script: output.script, angle: output.angle, createdAt: output.createdAt });
  }
  const job = generation.data;
  return { id, title: project.title, status: project.status, revision: project.revision, brief, plan: project.plan ? ugcPlanSchema.parse(project.plan) : null,
    presenterUrl, productUrls, outputs, error: project.error_message,
    job: job ? { id: job.id, status: job.status, cancelRequested: Boolean(job.cancel_requested_at), phase: typeof job.settings?.phase === "string" ? job.settings.phase.slice(0, 150) : null } : null };
}
