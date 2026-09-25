"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { productUrlSchema, ugcBriefSchema, ugcPlanSchema, ugcSelectionSchema, validateUgcPlan } from "@/lib/ugc/schema";
import { fetchPublicProduct, imageMime, parseProductPage } from "@/lib/ugc/product-import";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Check your ad details." : publicError(error); }
const uploadSchema = z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), size: z.number().int().positive().max(8 * 1024 * 1024) });

export async function createUgcUpload(input: unknown) {
  try {
    const file = uploadSchema.parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("assets").select("id", { head: true, count: "exact" }).eq("owner_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error || (daily.count || 0) >= 150) throw new Error("Upload limit reached or storage unavailable. Try later.");
    const assetId = randomUUID();
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.mime];
    const path = `${workspaceId}/${user.id}/ugc-inputs/${assetId}.${extension}`;
    const saved = await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: "reference", storage_path: path, mime_type: file.mime, byte_size: file.size });
    if (saved.error) throw new Error("Could not prepare the product photo.");
    const signed = await admin.storage.from("private-media").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) throw new Error("Could not start the private upload.");
    return { assetId, path, token: signed.data.token };
  } catch (error) { return { error: message(error) }; }
}

export async function importUgcProduct(input: unknown) {
  try {
    const url = productUrlSchema.parse(input);
    const { admin, user, workspaceId } = await requireAccount();
    const reserved = await admin.rpc("reserve_ugc_import", { owner_id: user.id });
    if (reserved.error) throw new Error("Product import unavailable or daily limit reached. Upload your photos instead.");
    const page = await fetchPublicProduct(url, "page");
    const details = parseProductPage(page.bytes.toString("utf8"), page.url);
    const images: { assetId: string; url: string }[] = [];
    for (const image of details.images) {
      try {
        const fetched = await fetchPublicProduct(image, "image");
        const mime = imageMime(fetched.bytes);
        const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime];
        const assetId = randomUUID(), path = `${workspaceId}/${user.id}/ugc-inputs/${assetId}.${extension}`;
        const stored = await admin.storage.from("private-media").upload(path, fetched.bytes, { contentType: mime, upsert: false });
        if (stored.error) continue;
        const row = await admin.from("assets").insert({ id: assetId, workspace_id: workspaceId, owner_id: user.id, kind: "reference", storage_path: path, mime_type: mime, byte_size: fetched.bytes.length });
        if (row.error) continue;
        const signed = await admin.storage.from("private-media").createSignedUrl(path, 900);
        if (signed.data) images.push({ assetId, url: signed.data.signedUrl });
      } catch { /* Individual protected/invalid images do not discard imported text. */ }
    }
    return { productName: details.productName, description: details.description, productUrl: page.url, images,
      warning: images.length ? "Imported details are unverified. Review every claim and photo before continuing." : "No usable product image was found. Upload a photo; the page details were imported for review." };
  } catch (error) { return { error: message(error) }; }
}

export async function createUgcProject(input: unknown) {
  try {
    const brief = ugcBriefSchema.parse(input);
    const { db, admin, user, workspaceId } = await requireAccount();
    const daily = await db.from("ugc_projects").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if (daily.error) throw new Error("UGC storage is not ready. Apply the UGC product-ads migration.");
    if ((daily.count || 0) >= 40) throw new Error("Daily project limit reached.");
    const assets = await db.from("assets").select("id,storage_path").eq("workspace_id", workspaceId).eq("owner_id", user.id).eq("kind", "reference").is("deleted_at", null).in("id", brief.productAssetIds);
    if (assets.error || assets.data?.length !== brief.productAssetIds.length || assets.data.some((asset) => !asset.storage_path.startsWith(`${workspaceId}/${user.id}/ugc-inputs/`))) throw new Error("A product photo is missing or belongs to another account.");
    const id = randomUUID();
    const saved = await admin.from("ugc_projects").insert({ id, workspace_id: workspaceId, user_id: user.id, title: brief.productName, brief });
    if (saved.error) throw new Error("Could not save your ad project.");
    revalidatePath("/studio/ugc"); return { id };
  } catch (error) { return { error: message(error) }; }
}

export async function saveUgcPlan(id: string, revision: number, input: unknown) {
  try {
    z.string().uuid().parse(id); z.number().int().nonnegative().parse(revision);
    const plan = ugcPlanSchema.parse(input);
    const { db, admin, user } = await requireAccount();
    const { data: project } = await db.from("ugc_projects").select("brief").eq("id", id).eq("user_id", user.id).single();
    if (!project) throw new Error("Project not found.");
    validateUgcPlan(plan, ugcBriefSchema.parse(project.brief));
    const saved = await admin.rpc("save_ugc_plan", { project_id: id, owner_id: user.id, expected_revision: revision, next_plan: plan });
    if (saved.error) throw new Error(saved.error.message);
    revalidatePath(`/studio/ugc/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}

export async function startUgcJob(id: string, kind: "plan" | "render", revision: number, selected: unknown = [], approved = false) {
  try {
    z.string().uuid().parse(id); z.enum(["plan", "render"]).parse(kind); z.number().int().nonnegative().parse(revision);
    const hookIds = kind === "render" ? ugcSelectionSchema.parse(selected) : [];
    if (kind === "render" && approved !== true) throw new Error("Review and approve the product claims and scripts before rendering.");
    const { db, admin, user } = await requireAccount();
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("The background worker is not connected yet.");
    const { data: project } = await db.from("ugc_projects").select("brief,plan").eq("id", id).eq("user_id", user.id).single();
    if (!project) throw new Error("Project not found.");
    if (kind === "render") validateUgcPlan(ugcPlanSchema.parse(project.plan), ugcBriefSchema.parse(project.brief));
    const reserved = await admin.rpc("start_ugc_job", { project_id: id, owner_id: user.id, job_id: randomUUID(), job_kind: kind, hook_ids: hookIds, expected_revision: revision });
    if (reserved.error || !reserved.data) throw new Error(reserved.error?.message || "Could not reserve credits.");
    const generationId = String(reserved.data);
    let stage: JobStage = "read_saved_job";
    try {
      const { data: job, error } = await db.from("generations").select("provider_request_id,status,cancel_requested_at").eq("id", generationId).single();
      if (error || !job) throw new Error("Saved job could not be read.");
      if (job.cancel_requested_at) return { error: "Cancellation is in progress. Check Jobs before trying again." };
      if (!job.provider_request_id && job.status === "reserved") {
        stage = "submit_task";
        const handle = await tasks.trigger("ugc-pipeline", { generationId }, { idempotencyKey: generationId, idempotencyKeyTTL: "30d", concurrencyKey: user.id, tags: [`project:${id}`, `generation:${generationId}`] }, { retry: { maxAttempts: 1 } });
        stage = "save_run";
        const saved = await admin.from("generations").update({ provider_request_id: handle.id, submitted_at: new Date().toISOString(), error_message: null }).eq("id", generationId).in("status", ["reserved", "submitted", "processing"]).is("cancel_requested_at", null).select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return { error: "Job state changed. Open Jobs to check progress." };
      }
    } catch (error) {
      const diagnostic = await recordDispatchFailure(admin, generationId, stage, error);
      return { error: `${diagnostic} Job saved; credits remain reserved. Reconnect without another charge, or cancel in Jobs.` };
    }
    revalidatePath(`/studio/ugc/${id}`); return { ok: true };
  } catch (error) { return { error: message(error) }; }
}
