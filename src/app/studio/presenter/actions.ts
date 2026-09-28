"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount } from "@/lib/account";
import { portraitUploadSchema, presenterSchema, presenterBriefSchema, PRESENTER_CONSENT_VERSION } from "@/lib/presenter/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";
import { imageMime } from "@/lib/ugc/images";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check your presenter details." : error instanceof Error ? error.message : "Presenter request failed. Please retry."; }
export async function createPresenterUpload(input: unknown) {
  try {
    const file = portraitUploadSchema.parse(input);
    const { admin, user, workspaceId } = await requireAccount();
    const count = await admin.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (count.error || (count.count || 0) >= 100) throw new Error("Upload limit reached or storage unavailable.");
    const assetId = randomUUID();
    const path = `${workspaceId}/${user.id}/presenter-inputs/${assetId}.${{ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.mime]}`;
    const row = await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: "reference", storage_path: path, mime_type: file.mime, byte_size: file.size });
    if (row.error) throw new Error("Could not prepare your private portrait.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) throw new Error("Upload is unavailable.");
    return { assetId, path, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}
export async function savePresenter(input: unknown) {
  try {
    const info = presenterSchema.parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const { data: asset } = await db.from("assets").select("storage_path,mime_type,byte_size").eq("id", info.assetId).eq("owner_id", user.id).eq("workspace_id", workspaceId).eq("kind", "reference").is("deleted_at", null).single();
    if (!asset || !asset.storage_path.startsWith(`${workspaceId}/${user.id}/presenter-inputs/`) || asset.storage_path.includes("..")) throw new Error("Choose a portrait uploaded by your account.");
    const stored = await admin.storage.from("private-media").info(asset.storage_path);
    if (stored.error || !stored.data || stored.data.size !== Number(asset.byte_size) || stored.data.size > 8 * 1024 * 1024) throw new Error("Portrait upload is incomplete or too large.");
    const photo = await admin.storage.from("private-media").download(asset.storage_path);
    if (photo.error || !photo.data || photo.data.size > 8 * 1024 * 1024 || imageMime(Buffer.from(await photo.data.arrayBuffer())) !== asset.mime_type) throw new Error("Choose a valid JPG, PNG or WebP image.");
    const result = await admin.rpc("create_presenter", { presenter_id: randomUUID(), owner_id: user.id, target_workspace: workspaceId, portrait_asset: info.assetId, presenter_name: info.name, consent_version: PRESENTER_CONSENT_VERSION });
    if (result.error) throw new Error("Presenter could not be saved. Check storage setup or the 40-presenter limit.");
    revalidatePath("/studio/presenter"); return { id: String(result.data) };
  } catch (error) { return { error: message(error) }; }
}
export async function createPresenterProject(input: unknown) {
  try {
    const parsed = z.object({ requestId: z.uuid(), presenterId: z.uuid(), brief: presenterBriefSchema, approved: z.literal(true) }).parse(input);
    const { admin, user, workspaceId } = await requireAccount();
    const result = await admin.rpc("create_presenter_project", { project_id: parsed.requestId, owner_id: user.id, target_workspace: workspaceId, avatar_id: parsed.presenterId, next_brief: parsed.brief });
    if (result.error) throw new Error("Could not save the video. Check presenter consent and your daily project limit.");
    revalidatePath("/studio/presenter"); return { id: String(result.data) };
  } catch (error) { return { error: message(error) }; }
}
export async function startPresenterJob(id: string) {
  try {
    z.uuid().parse(id);
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const project = await db.from("presenter_projects").select("brief").eq("id", id).eq("user_id", user.id).single();
    if (!project.data || project.error) throw new Error("Project not found.");
    presenterBriefSchema.parse(project.data.brief);
    const reserved = await admin.rpc("start_presenter_job", { project_id: id, owner_id: user.id, job_id: randomUUID() });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data);
    let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read.");
      if (job.cancel_requested_at) return { error: "Cancellation is in progress. Wait for it to finish before retrying." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger("presenter-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString() }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "The job state changed. Refresh to see its current status." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Your job is saved. Reconnect without another reservation, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/presenter/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
export async function revokePresenter(id: string) {
  try {
    z.uuid().parse(id); const { admin, user } = await requireAccount();
    const result = await admin.rpc("revoke_presenter", { avatar_id: id, owner_id: user.id });
    if (result.error) throw new Error("Cancel or finish this presenter's running videos before revoking consent.");
    // Future generation is fenced in the database before deleting the source.
    if (typeof result.data === "string") {
      const removed = await admin.storage.from("private-media").remove([result.data]);
      if (removed.error) return { error: "Consent revoked, but source deletion needs a retry. Click revoke again or contact support." };
    }
    revalidatePath("/studio/presenter"); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
