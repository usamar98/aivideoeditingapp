import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cartoonBriefSchema, cartoonStorySchema, type CartoonProjectView } from "./schema";
import { z } from "zod";

export async function getCartoonProject(db: SupabaseClient, userId: string, id: string): Promise<CartoonProjectView | null> {
  const { data: project, error } = await db.from("cartoon_projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Cartoon projects could not be loaded. Apply the cartoon-studio migration first.");
  if (!project) return null;
  const paths = z.record(z.string(), z.string()).parse(project.cast_paths);
  const prefix = `${project.workspace_id}/${userId}/`;
  async function sign(storagePath: string | null) {
    if (!storagePath || !storagePath.startsWith(prefix) || storagePath.includes("..")) return null;
    const { data, error: signError } = await db.storage.from("private-media").createSignedUrl(storagePath, 900);
    if (signError) throw new Error("Private preview is temporarily unavailable. Refresh to retry.");
    return data?.signedUrl || null;
  }
  const [cast, outputUrl, generation] = await Promise.all([
    Promise.all(Object.entries(paths).map(async ([id, value]) => [id, await sign(value)] as const)),
    sign(project.output_path),
    project.generation_id ? db.from("generations").select("id,status,cancel_requested_at,settings").eq("id", project.generation_id).eq("requested_by", userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (generation.error) throw new Error("Job progress is temporarily unavailable.");
  const job = generation.data;
  return { id: project.id, title: project.title, status: project.status, brief: cartoonBriefSchema.parse(project.brief),
    storyboard: project.storyboard ? cartoonStorySchema.parse(project.storyboard) : null,
    castUrls: Object.fromEntries(cast.filter((pair): pair is readonly [string, string] => pair[1] !== null)), outputUrl, error: project.error_message,
    job: job ? { id: job.id, status: job.status, cancelRequested: Boolean(job.cancel_requested_at), phase: typeof job.settings?.phase === "string" ? job.settings.phase.slice(0, 150) : null } : null };
}
