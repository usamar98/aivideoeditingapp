"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { estateBriefSchema } from "@/lib/real-estate/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check your listing details." : publicError(error); }
export async function createEstateUpload(input: unknown) {
  try {
    const file = z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), size: z.number().int().positive().max(8 * 1024 * 1024) }).parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error || (daily.count || 0) >= 150) throw new Error("Upload limit reached or storage unavailable. Try later.");
    const assetId = randomUUID(), extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.mime];
    const path = `${workspaceId}/${user.id}/real-estate-inputs/${assetId}.${extension}`;
    if ((await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: "reference", storage_path: path, mime_type: file.mime, byte_size: file.size })).error) throw new Error("Could not prepare the property photo.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) throw new Error("Could not start the private upload.");
    return { assetId, path, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}
export async function createEstateProject(input: unknown, approved: boolean) {
  try {
    if (approved !== true) throw new Error("Confirm photo rights and review all listing facts first.");
    const brief = estateBriefSchema.parse(input), { admin, user, workspaceId } = await requireAccount(), id = randomUUID();
    const saved = await admin.rpc("create_real_estate_project", { project_id: id, owner_id: user.id, target_workspace: workspaceId, next_brief: brief });
    if (saved.error) throw new Error("Could not save your listing. Check uploaded photos and apply the real-estate migration if this feature is new.");
    revalidatePath("/studio/real-estate"); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function startEstateJob(id: string, approved: boolean) {
  try {
    z.uuid().parse(id);
    if (approved !== true) throw new Error("Review the listing and confirm the displayed credit cost.");
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const { data: project } = await db.from("real_estate_projects").select("brief").eq("id", id).eq("user_id", user.id).single();
    if (!project) throw new Error("Project not found."); estateBriefSchema.parse(project.brief);
    const reserved = await admin.rpc("start_real_estate_job", { project_id: id, owner_id: user.id, job_id: randomUUID() });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data); let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read.");
      if (job.cancel_requested_at) return { error: "Cancellation is in progress. Check Jobs before trying again." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger("real-estate-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString(), error_message: null }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "Job state changed. Open Jobs to check progress." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Job saved; credits remain reserved. Reconnect without another charge, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/real-estate/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
