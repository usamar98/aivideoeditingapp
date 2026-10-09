"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { adRemakeBriefSchema, adRemakeUploadSchema } from "@/lib/ad-remake/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check your remake details." : publicError(error); }
export async function createAdRemakeUpload(input: unknown) {
  try {
    const file = adRemakeUploadSchema.parse(input), { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error || (daily.count || 0) >= 100) throw new Error("Daily upload limit reached or storage unavailable.");
    const assetId = randomUUID(), extension = { "video/mp4": "mp4", "video/quicktime": "mov", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.mime];
    const path = `${workspaceId}/${user.id}/ad-remake-inputs/${assetId}.${extension}`;
    const saved = await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: file.kind === "video" ? "video" : "reference", storage_path: path, mime_type: file.mime, byte_size: file.size });
    if (saved.error) throw new Error("Could not prepare the private upload.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) throw new Error("Could not start the private upload.");
    return { assetId, path, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}
export async function createAdRemakeProject(input: unknown) {
  try {
    const brief = adRemakeBriefSchema.parse(input), { db, admin, user, workspaceId } = await requireAccount();
    const ids = [brief.sourceAssetId, ...brief.productAssetIds];
    const assets = await db.from("assets").select("id,storage_path,byte_size").eq("owner_id", user.id).eq("workspace_id", workspaceId).is("deleted_at", null).in("id", ids);
    if (assets.error || assets.data?.length !== ids.length) throw new Error("Choose uploaded assets from your account.");
    for (const asset of assets.data) {
      if (!asset.storage_path.startsWith(`${workspaceId}/${user.id}/ad-remake-inputs/`) || asset.storage_path.includes("..")) throw new Error("Invalid remake asset.");
      const uploaded = await admin.storage.from("private-media").info(asset.storage_path);
      if (uploaded.error || !uploaded.data || Number(uploaded.data.size) !== Number(asset.byte_size)) throw new Error("An upload has not finished. Retry it first.");
    }
    const id = randomUUID();
    const saved = await admin.rpc("create_ad_remake_project", { project_id: id, owner_id: user.id, target_workspace: workspaceId, next_brief: brief });
    if (saved.error) throw new Error("Could not save your remake. Check uploads and apply the Ad Remake migration.");
    revalidatePath("/studio/ad-remake"); return { id };
  } catch (error) { return { error: message(error) }; }
}
export async function startAdRemakeJob(id: string, approved: boolean) {
  try {
    z.uuid().parse(id);
    if (approved !== true) throw new Error("Review the reference, instructions and credit cost before rendering.");
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const project = await db.from("ad_remake_projects").select("brief").eq("id", id).eq("user_id", user.id).single();
    if (!project.data) throw new Error("Project not found."); adRemakeBriefSchema.parse(project.data.brief);
    const reserved = await admin.rpc("start_ad_remake_job", { project_id: id, owner_id: user.id, job_id: randomUUID() });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data); let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read.");
      if (job.cancel_requested_at) return { error: "Cancellation is in progress. Check Jobs before trying again." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger("ad-remake-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString(), error_message: null }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "Job state changed. Open Jobs to check progress." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Job saved; credits remain reserved. Reconnect without another charge, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/ad-remake/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
