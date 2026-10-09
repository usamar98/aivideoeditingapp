import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adRemakeBriefSchema, type AdRemakeProject } from "./schema";

export async function getAdRemakeProject(db: SupabaseClient, user: string, id: string): Promise<AdRemakeProject | null> {
  const { data: p, error } = await db.from("ad_remake_projects").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  if (error) throw new Error("Ad Remake storage is unavailable. Check the migration."); if (!p) return null;
  const brief = adRemakeBriefSchema.parse(p.brief), prefix = `${p.workspace_id}/${user}/`;
  const sign = async (value: unknown) => {
    if (typeof value !== "string" || ![`${prefix}ad-remake/`, `${prefix}ad-remake-inputs/`].some(root => value.startsWith(root)) || value.includes("..")) return null;
    const result = await db.storage.from("private-media").createSignedUrl(value, 900);
    if (result.error) throw new Error("Private preview unavailable. Refresh to retry."); return result.data?.signedUrl || null;
  };
  const [assets, generation, videoUrl] = await Promise.all([
    db.from("assets").select("id,storage_path").eq("owner_id", user).eq("workspace_id", p.workspace_id).is("deleted_at", null).in("id", [brief.sourceAssetId, ...brief.productAssetIds]),
    p.generation_id ? db.from("generations").select("id,status,settings,cancel_requested_at").eq("id", p.generation_id).eq("requested_by", user).single() : Promise.resolve({ data: null, error: null }),
    sign(p.output_path),
  ]);
  if (assets.error || generation.error) throw new Error("Could not load remake progress.");
  const assetUrl = (assetId: string) => sign(assets.data?.find(a => a.id === assetId)?.storage_path), j = generation.data;
  return { id, title: p.title, brief, status: p.status, error: p.error_message, videoUrl,
    sourceUrl: await assetUrl(brief.sourceAssetId), productUrls: (await Promise.all(brief.productAssetIds.map(assetUrl))).filter((url): url is string => Boolean(url)),
    job: j ? { id: j.id, status: j.status, phase: typeof j.settings?.phase === "string" ? j.settings.phase.slice(0, 150) : null, cancelRequested: Boolean(j.cancel_requested_at) } : null };
}
