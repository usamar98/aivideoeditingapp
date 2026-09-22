import { randomUUID } from "node:crypto";

import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

import type { episodePipeline } from "../../../../trigger/episode-pipeline";
import { getIntegrationStatuses, isFixtureMode } from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  generationId: z.string().uuid(),
  idempotencyKey: z.string().min(12).max(160),
  sceneVideoUrls: z.array(z.string().url()).min(1).max(10),
  audioUrl: z.string().url().optional(),
  captionsUrl: z.string().url().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  estimatedCredits: z.number().positive().max(10_000),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid generation request", issues: input.error.issues }, { status: 400 });

  const missing = getIntegrationStatuses().filter((item) => ["supabase", "trigger"].includes(item.key) && !item.configured);
  if (isFixtureMode() || missing.length > 0) {
    return Response.json(
      { error: "Real generation is unavailable", missing: missing.map((item) => item.label), fixture: true },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return Response.json({ error: "Supabase is unavailable" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  const generationRecord = {
    id: input.data.generationId,
    workspace_id: input.data.workspaceId,
    requested_by: userId,
    operation: "episode-export",
    provider: "trigger.dev",
    model: "ffmpeg-7",
    settings: { aspectRatio: input.data.aspectRatio },
    input_asset_versions: input.data.sceneVideoUrls,
    status: "created",
    idempotency_key: input.data.idempotencyKey,
    estimated_credits: input.data.estimatedCredits,
  };
  let { data: generation, error: createError } = await supabase
    .from("generations")
    .insert(generationRecord)
    .select("id,status,provider_request_id,output_asset_ids")
    .single();

  if (createError?.code === "23505") {
    const existing = await supabase.from("generations").select("id,status,provider_request_id,output_asset_ids").eq("workspace_id", input.data.workspaceId).eq("idempotency_key", input.data.idempotencyKey).single();
    generation = existing.data;
    createError = existing.error;
    if (generation?.provider_request_id || (generation && ["submitted", "processing", "succeeded"].includes(generation.status))) return Response.json({ generation, duplicate: true }, { status: 202 });
    if (generation && ["failed", "cancelled"].includes(generation.status)) return Response.json({ generation, duplicate: true, error: `Generation already ${generation.status}` }, { status: 409 });
  }

  if (createError || !generation) return Response.json({ error: createError?.message || "Could not create generation record" }, { status: 409 });

  const { error: reserveError } = await supabase.schema("api").rpc("reserve_generation_credits", {
    workspace_id: input.data.workspaceId,
    generation_id: generation.id,
    credits: input.data.estimatedCredits,
    idempotency_key: `${input.data.idempotencyKey}:reserve`,
  });
  if (reserveError) {
    await admin.from("generations").update({ status: "failed", error_message: reserveError.message, completed_at: new Date().toISOString() }).eq("id", generation.id);
    return Response.json({ error: reserveError.message }, { status: 402 });
  }

  let outputAssetId: string | null = null;
  let submissionStarted = false;
  try {
    outputAssetId = generation.output_asset_ids?.[0] || randomUUID();
    let outputPath: string | null = null;
    if (generation.output_asset_ids?.[0]) {
      const { data: existingAsset } = await supabase.from("assets").select("storage_path").eq("id", outputAssetId).maybeSingle();
      outputPath = existingAsset?.storage_path || null;
    }
    if (!outputPath) {
      outputPath = `${input.data.workspaceId}/${userId}/${outputAssetId}.mp4`;
      const { error: assetError } = await supabase.from("assets").insert({ id: outputAssetId, workspace_id: input.data.workspaceId, owner_id: userId, kind: "export", storage_bucket: "private-media", storage_path: outputPath, mime_type: "video/mp4" });
      if (assetError) throw new Error(`Could not prepare export storage: ${assetError.message}`);
      await admin.from("generations").update({ output_asset_ids: [outputAssetId] }).eq("id", generation.id);
    }
    const { data: signedUpload, error: uploadError } = await supabase.storage.from("private-media").createSignedUploadUrl(outputPath);
    if (uploadError) throw new Error(`Could not sign export upload: ${uploadError.message}`);
    if (!outputAssetId) throw new Error("Could not resolve the export asset.");

    const triggerKey = await idempotencyKeys.create(input.data.idempotencyKey, { scope: "global" });
    submissionStarted = true;
    const handle = await tasks.trigger<typeof episodePipeline>(
      "episode-pipeline",
      {
        generationId: generation.id,
        workspaceId: input.data.workspaceId,
        sceneVideoUrls: input.data.sceneVideoUrls,
        audioUrl: input.data.audioUrl,
        captionsUrl: input.data.captionsUrl,
        aspectRatio: input.data.aspectRatio,
        outputUploadUrl: signedUpload.signedUrl,
        outputAssetId,
        reservedCredits: input.data.estimatedCredits,
      },
      { idempotencyKey: triggerKey, concurrencyKey: input.data.workspaceId, tags: [`generation:${generation.id}`, `workspace:${input.data.workspaceId}`] },
    );
    await admin.from("generations").update({ status: "submitted", provider_request_id: handle.id, submitted_at: new Date().toISOString() }).eq("id", generation.id);
    return Response.json({ generationId: generation.id, runId: handle.id, status: "submitted" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trigger submission failed";
    if (submissionStarted) {
      await admin.from("generations").update({ status: "reserved", error_message: `Submission outcome unknown: ${message}` }).eq("id", generation.id);
      return Response.json({ error: "Submission outcome is uncertain. Retry with the same idempotency key to reconcile without another charge.", generationId: generation.id, creditsReserved: true, retriable: true }, { status: 502 });
    }
    await admin.schema("api").rpc("settle_generation_credits", { generation_id: generation.id, used_credits: 0, idempotency_key: `${input.data.idempotencyKey}:release` });
    if (outputAssetId) await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", outputAssetId);
    await admin.from("generations").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", generation.id);
    return Response.json({ error: message, creditsReleased: true }, { status: 502 });
  }
}
