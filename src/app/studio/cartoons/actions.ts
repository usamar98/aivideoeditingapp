"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { isSeedanceModel, cartoonBriefSchema, cartoonStorySchema, validateCartoonStory } from "@/lib/cartoons/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";
import type { cartoonPipeline } from "../../../../trigger/cartoon-pipeline";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check the form fields." : publicError(error); }

export async function createCartoonUpload(input: unknown) {
  try {
    const file = z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), size: z.number().int().positive().max(8 * 1024 * 1024) }).parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error || (daily.count || 0) >= 150) throw new Error("Upload limit reached or storage unavailable. Try again later.");
    const id = randomUUID(), extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.mime];
    const storagePath = `${workspaceId}/${user.id}/${id}.${extension}`;
    const asset = await admin.from("assets").insert({ id, workspace_id: workspaceId, owner_id: user.id, kind: "reference", storage_path: storagePath, mime_type: file.mime, byte_size: file.size });
    if (asset.error) throw new Error("Could not save character upload.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data) throw new Error("Could not prepare private upload.");
    return { assetId: id, path: storagePath, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}

export async function createCartoonProject(input: unknown) {
  try {
    const brief = cartoonBriefSchema.parse(input);
    if (isSeedanceModel(brief.model) && process.env.CARTOON_SEEDANCE_ENABLED !== "true") throw new Error("Seedance access has not been enabled by the studio owner. Select Kling O3 Pro.");
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("cartoon_projects").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error) throw new Error("Apply the cartoon-studio migration before creating cartoons.");
    if ((daily.count || 0) >= 50) throw new Error("Daily project limit reached.");
    if (new Set(brief.references.map((ref) => ref.assetId)).size !== brief.references.length) throw new Error("Choose a different image for each character.");
    if (brief.references.length) {
      const refs = await db.from("assets").select("id").eq("owner_id", user.id).eq("workspace_id", workspaceId).eq("kind", "reference").is("deleted_at", null).in("id", brief.references.map((r) => r.assetId));
      if (refs.error || refs.data?.length !== brief.references.length) throw new Error("Character upload is missing or belongs to another account.");
    }
    const id = randomUUID();
    const saved = await admin.from("cartoon_projects").insert({ id, workspace_id: workspaceId, user_id: user.id, title: brief.prompt.slice(0, 80), brief });
    if (saved.error) throw new Error("Could not save your cartoon project.");
    revalidatePath("/studio/cartoons"); return { id };
  } catch (error) { return { error: message(error) }; }
}

export async function saveCartoonStory(id: string, input: unknown) {
  try {
    z.string().uuid().parse(id);
    const story = cartoonStorySchema.parse(input);
    const { db, admin, user } = await requireAccount();
    const { data: project } = await db.from("cartoon_projects").select("brief,storyboard").eq("id", id).eq("user_id", user.id).single();
    if (!project?.storyboard) throw new Error("Create your cast first.");
    validateCartoonStory(story, cartoonBriefSchema.parse(project.brief));
    const previous = cartoonStorySchema.parse(project.storyboard);
    if (JSON.stringify(story.characters) !== JSON.stringify(previous.characters)) throw new Error("The approved cast is locked for visual consistency. Start a new project to redesign characters.");
    const saved = await admin.from("cartoon_projects").update({ storyboard: story, title: story.title, status: "ready", output_path: null, error_message: null }).eq("id", id).eq("user_id", user.id).in("status", ["ready", "complete", "failed"]).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Wait for the current job to finish before editing.");
    revalidatePath(`/studio/cartoons/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}

export async function startCartoonJob(id: string, kind: "plan" | "render") {
  try {
    z.string().uuid().parse(id); z.enum(["plan", "render"]).parse(kind);
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const { data: project } = await db.from("cartoon_projects").select("brief,storyboard").eq("id", id).eq("user_id", user.id).single();
    if (!project) throw new Error("Project not found.");
    const brief = cartoonBriefSchema.parse(project.brief);
    if (isSeedanceModel(brief.model) && process.env.CARTOON_SEEDANCE_ENABLED !== "true") throw new Error("Seedance access must be enabled by the owner first.");
    if (kind === "render") validateCartoonStory(cartoonStorySchema.parse(project.storyboard), brief);
    const reserved = await admin.rpc("start_cartoon_job", { project_id: id, owner_id: user.id, job_id: randomUUID(), job_kind: kind });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data);
    let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read");
      if (job.cancel_requested_at) return { error: "Cancellation is in progress. Check Jobs before trying again." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger<typeof cartoonPipeline>("cartoon-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString(), error_message: null }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "Job state changed during submission. Open Jobs to see its current status." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Job saved; credits remain reserved. Reconnect this job without another charge, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/cartoons/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
