import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { presenterBriefSchema, type PresenterProject, type PresenterView } from "./schema";

async function sign(db: SupabaseClient, value: unknown, workspace: string, user: string) {
  if (typeof value !== "string" || !value.startsWith(`${workspace}/${user}/presenter`) || value.includes("..")) return null;
  const result = await db.storage.from("private-media").createSignedUrl(value, 900);
  if (result.error) throw new Error("Private preview unavailable. Refresh to try again.");
  return result.data?.signedUrl || null;
}
export async function listPresenters(db: SupabaseClient, user: string): Promise<PresenterView[]> {
  const { data, error } = await db.from("presenters").select("id,name,portrait_path,workspace_id,revoked_at").eq("user_id", user).is("revoked_at", null).order("created_at", { ascending: false }).limit(40);
  if (error) throw new Error("Presenter storage is not ready. Apply the digital-clone migration.");
  return Promise.all((data || []).map(async p => ({ id: p.id, name: p.name, portraitUrl: await sign(db, p.portrait_path, p.workspace_id, user), revoked: false })));
}
export async function getPresenterProject(db: SupabaseClient, user: string, id: string): Promise<PresenterProject | null> {
  const { data: p, error } = await db.from("presenter_projects").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  if (error) throw new Error("Presenter projects are unavailable.");
  if (!p) return null;
  const [presenter, generation, videoUrl, captionsUrl] = await Promise.all([
    db.from("presenters").select("id,name,portrait_path,revoked_at").eq("id", p.presenter_id).eq("user_id", user).single(),
    p.generation_id ? db.from("generations").select("id,status,settings,cancel_requested_at,estimated_credits,reported_credits").eq("id", p.generation_id).eq("requested_by", user).single() : Promise.resolve({ data: null, error: null }),
    sign(db, p.output_path, p.workspace_id, user), sign(db, p.captions_path, p.workspace_id, user),
  ]);
  if (presenter.error || !presenter.data || generation.error) throw new Error("Could not load presenter progress.");
  const a = presenter.data, j = generation.data;
  return { id, title: p.title, brief: presenterBriefSchema.parse(p.brief), status: p.status, videoUrl, captionsUrl, error: p.error_message,
    presenter: { id: a.id, name: a.name, revoked: Boolean(a.revoked_at), portraitUrl: a.revoked_at ? null : await sign(db, a.portrait_path, p.workspace_id, user) },
    job: j ? { id: j.id, status: j.status, phase: typeof j.settings?.phase === "string" ? j.settings.phase.slice(0, 150) : null, cancelRequested: Boolean(j.cancel_requested_at), credits: Number(j.estimated_credits), used: j.reported_credits === null ? null : Number(j.reported_credits) } : null };
}
