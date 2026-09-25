"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount } from "@/lib/account";
import { shortsUploadSchema, shortsBriefSchema, shortsPlanSchema, shortsAnalysisSchema, shortsSelectionSchema, validateShortsPlan, SHORTS_MAX_BYTES } from "@/lib/shorts/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check your clip settings." : error instanceof Error ? error.message : "Shorts could not be saved. Please retry."; }
export async function createShortsUpload(input: unknown) {
  try {
    const file = shortsUploadSchema.parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).eq("kind", "video").gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error || (daily.count || 0) >= 10) throw new Error("Daily video upload limit reached or storage unavailable.");
    const assetId = randomUUID(), ext = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[file.mime];
    const path = `${workspaceId}/${user.id}/shorts-inputs/${assetId}.${ext}`;
    const saved = await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: "video", storage_path: path, mime_type: file.mime, byte_size: file.size });
    if (saved.error) throw new Error("Could not prepare your video upload.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) throw new Error("Could not start private upload.");
    return { assetId, path, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}
export async function createShortsProject(input: unknown) {
  try {
    const brief = shortsBriefSchema.parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("shorts_projects").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error) throw new Error("Apply the podcast Shorts migration before creating projects.");
    if ((daily.count || 0) >= 10) throw new Error("Daily Shorts project limit reached.");
    const { data: asset } = await db.from("assets").select("storage_path,byte_size").eq("id", brief.sourceAssetId).eq("owner_id", user.id).eq("workspace_id", workspaceId).eq("kind", "video").is("deleted_at", null).maybeSingle();
    if (!asset || !asset.storage_path.startsWith(`${workspaceId}/${user.id}/shorts-inputs/`) || asset.storage_path.includes("..") || asset.byte_size > SHORTS_MAX_BYTES) throw new Error("Choose an uploaded video from your account.");
    const uploaded = await admin.storage.from("private-media").info(asset.storage_path);
    if (uploaded.error || !uploaded.data || Number(uploaded.data.size) !== Number(asset.byte_size)) throw new Error("Video upload has not finished. Retry the upload first.");
    const id = randomUUID();
    if ((await admin.from("shorts_projects").insert({ id, user_id: user.id, workspace_id: workspaceId, title: brief.title, brief })).error) throw new Error("Could not save your project.");
    revalidatePath("/studio/shorts"); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function saveShortsPlan(id: string, revision: number, input: unknown) {
  try {
    z.string().uuid().parse(id); z.number().int().nonnegative().parse(revision);
    const plan = shortsPlanSchema.parse(input), { db, admin, user } = await requireAccount();
    const { data: project } = await db.from("shorts_projects").select("analysis").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!project) throw new Error("Project not found.");
    validateShortsPlan(plan, shortsAnalysisSchema.parse(project.analysis));
    const saved = await admin.rpc("save_shorts_plan", { project_id: id, owner_id: user.id, expected_revision: revision, next_plan: plan });
    if (saved.error) throw new Error(saved.error.message);
    revalidatePath(`/studio/shorts/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
export async function startShortsJob(id: string, kind: "analyze" | "render", revision: number, selected: unknown = []) {
  try {
    z.string().uuid().parse(id); z.enum(["analyze", "render"]).parse(kind); z.number().int().nonnegative().parse(revision);
    const clipIds = kind === "render" ? shortsSelectionSchema.parse(selected) : [];
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const { data: project } = await db.from("shorts_projects").select("plan,analysis").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!project) throw new Error("Project not found.");
    if (kind === "render") validateShortsPlan(shortsPlanSchema.parse(project.plan), shortsAnalysisSchema.parse(project.analysis));
    const reserved = await admin.rpc("start_shorts_job", { project_id: id, owner_id: user.id, job_id: randomUUID(), job_kind: kind, clip_ids: clipIds, expected_revision: revision });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data); let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read.");
      if (job.cancel_requested_at) return { error: "Cancellation in progress. Check Jobs before retrying." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger("shorts-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString(), error_message: null }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "Job state changed while connecting. Refresh Jobs to see whether it finished or was cancelled." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Job saved; credits remain reserved. Reconnect without another reservation, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/shorts/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
