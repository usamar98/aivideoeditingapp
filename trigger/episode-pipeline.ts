import { execFile } from "node:child_process";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertJobActive, claimJob, finishCancelledJob } from "./job-control";

const execFileAsync = promisify(execFile);

const payloadSchema = z.object({
  generationId: z.string().min(1),
  workspaceId: z.string().min(1),
  sceneVideoUrls: z.array(z.string().url()).min(1).max(10),
  audioUrl: z.string().url().optional(),
  captionsUrl: z.string().url().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  outputUploadUrl: z.string().url(),
  outputAssetId: z.string().uuid(),
  reservedCredits: z.number().positive(),
});

function createJobDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase job credentials are missing.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function finalizeGeneration(payload: z.infer<typeof payloadSchema>, succeeded: boolean, error?: unknown) {
  const database = createJobDatabaseClient();
  const result = await database.rpc("finish_episode_job", {
    job_id: payload.generationId, succeeded, output_asset_id: payload.outputAssetId,
    failure_message: error instanceof Error ? error.message : error ? String(error) : null,
  });
  if (result.error) throw new Error(`Generation finalization failed: ${result.error.message}`);
}

function assertOutputUploadUrl(raw: string) {
  const url = new URL(raw);
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageUrl || url.protocol !== "https:" || url.origin !== new URL(storageUrl).origin || !url.pathname.includes("/storage/v1/object/upload/sign/private-media/")) {
    throw new Error("Output upload URL is not an approved Supabase Storage destination.");
  }
  return url;
}

function assertAllowedUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Only HTTPS media URLs are allowed.");
  const storageHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  const allowed = [...new Set([storageHost, ...(process.env.MEDIA_FETCH_HOSTS || "").split(",")].map((host) => host?.trim()).filter((host): host is string => Boolean(host)))];
  if (!allowed.includes(url.hostname)) {
    throw new Error(`Media host ${url.hostname} is not allowed.`);
  }
  return url;
}

async function download(url: string, target: string, signal: AbortSignal) {
  const response = await fetch(assertAllowedUrl(url), { signal });
  if (!response.ok) throw new Error(`Media download failed with ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 500 * 1024 * 1024) throw new Error("Media input exceeds the 500 MB limit.");
  if (!response.body) throw new Error("Media download returned an empty body.");
  const file = await open(target, "w");
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 500 * 1024 * 1024) throw new Error("Media input exceeds the 500 MB limit.");
      await file.write(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    await file.close();
  }
}

export const episodePipeline = schemaTask({
  id: "episode-pipeline",
  schema: payloadSchema,
  queue: { concurrencyLimit: 2 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, randomize: true },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(createJobDatabaseClient(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    await finalizeGeneration(payload, result.ok, result.ok ? undefined : result.error);
  },
  run: async (payload, { signal, ctx }) => {
    const database = createJobDatabaseClient();
    await claimJob(database, payload.generationId, ctx.run.id, ctx.attempt.number);
    const checkpoint = () => assertJobActive(database, payload.generationId, signal);
    await checkpoint();
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    const workdir = await mkdtemp(path.join(tmpdir(), `framefoundry-${payload.generationId}-`));
    metadata
      .set("generationId", payload.generationId)
      .set("phase", "downloading")
      .set("progress", 5);

    try {
      const scenePaths: string[] = [];
      for (const [index, url] of payload.sceneVideoUrls.entries()) {
        const scenePath = path.join(workdir, `scene-${index}.mp4`);
        await checkpoint();
        await download(url, scenePath, signal);
        scenePaths.push(scenePath);
        metadata.set("progress", 5 + Math.round(((index + 1) / payload.sceneVideoUrls.length) * 30));
      }

      const concatFile = path.join(workdir, "scenes.txt");
      await writeFile(
        concatFile,
        scenePaths.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
        "utf8",
      );

      const outputPath = path.join(workdir, "episode.mp4");
      const args = ["-y", "-f", "concat", "-safe", "0", "-i", concatFile];
      let inputIndex = 1;
      let audioInput: number | null = null;
      let captionsInput: number | null = null;
      if (payload.audioUrl) {
        const audioPath = path.join(workdir, "voice-track.mp3");
        await download(payload.audioUrl, audioPath, signal);
        audioInput = inputIndex++;
        args.push("-i", audioPath);
      }
      if (payload.captionsUrl) {
        const captionsPath = path.join(workdir, "captions.vtt");
        await download(payload.captionsUrl, captionsPath, signal);
        captionsInput = inputIndex++;
        args.push("-i", captionsPath);
      }
      const [width, height] = payload.aspectRatio === "16:9" ? [1920, 1080] : [1080, 1920];
      args.push(
        "-map",
        "0:v:0",
        ...(audioInput === null ? ["-an"] : ["-map", `${audioInput}:a:0`, "-c:a", "aac", "-b:a", "192k", "-shortest"]),
        ...(captionsInput === null ? [] : ["-map", `${captionsInput}:s:0`, "-c:s", "mov_text", "-metadata:s:s:0", "language=eng"]),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      );

      metadata.set("phase", "rendering").set("progress", 55);
      logger.info("Rendering episode", { generationId: payload.generationId, attempt: ctx.attempt.number });
      await checkpoint();
      await execFileAsync(ffmpegPath, args, { signal, timeout: 25 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });

      metadata.set("phase", "uploading").set("progress", 90);
      await checkpoint();
      const upload = await fetch(assertOutputUploadUrl(payload.outputUploadUrl), {
        method: "PUT",
        headers: { "content-type": "video/mp4" },
        body: await import("node:fs").then(({ createReadStream }) => createReadStream(outputPath)) as never,
        // Node fetch requires duplex when streaming a request body.
        duplex: "half",
        signal,
      } as RequestInit & { duplex: "half" });
      if (!upload.ok) throw new Error(`Output upload failed with ${upload.status}.`);

      await checkpoint();
      metadata.set("phase", "complete").set("progress", 100);
      return {
        generationId: payload.generationId,
        status: "succeeded" as const,
        renderedSceneCount: scenePaths.length,
      };
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  },
});
