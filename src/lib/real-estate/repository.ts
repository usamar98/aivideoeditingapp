import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estateBriefSchema, type EstateProject } from "./schema";

export async function getEstateProject(db: SupabaseClient, user: string, id: string): Promise<EstateProject | null> {
  const { data: p, error } = await db.from("real_estate_projects").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  if (error) throw new Error("Listing projects are unavailable. Check the real-estate migration.");
  if (!p) return null;
  const brief = estateBriefSchema.parse(p.brief);
  const sign = async (value: unknown) => {
    if (typeof value !== "string" || !value.startsWith(`${p.workspace_id}/${user}/real-estate`) || value.includes("..")) return null;
    const result = await db.storage.from("private-media").createSignedUrl(value, 900);
    if (result.error) throw new Error("Private preview unavailable. Refresh to try again."); return result.data?.signedUrl || null;
  };
  const [assets, generation, videoUrl, captionsUrl] = await Promise.all([
    db.from("assets").select("id,storage_path").eq("owner_id", user).eq("workspace_id", p.workspace_id).is("deleted_at", null).in("id", brief.rooms.map(r => r.assetId)),
    p.generation_id ? db.from("generations").select("id,status,settings,cancel_requested_at").eq("id", p.generation_id).eq("requested_by", user).single() : Promise.resolve({ data: null, error: null }),
    sign(p.output_path), sign(p.captions_path),
  ]);
  if (assets.error || generation.error) throw new Error("Could not load listing progress.");
  const j = generation.data;
  return { id, title: p.title, brief, status: p.status, error: p.error_message, videoUrl, captionsUrl,
    photos: await Promise.all((assets.data || []).map(async a => ({ id: a.id, url: await sign(a.storage_path) }))),
    job: j ? { id: j.id, status: j.status, phase: typeof j.settings?.phase === "string" ? j.settings.phase.slice(0, 150) : null, cancelRequested: Boolean(j.cancel_requested_at) } : null };
}
