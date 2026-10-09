import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { schemaTask, metadata, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { adRemakeBriefSchema, adRemakeModels, adRemakeInput, validateAdRemakeSource, AD_REMAKE_MAX_BYTES } from "../src/lib/ad-remake/schema";
import { imageMime } from "../src/lib/ugc/images";
import { claimJob, assertJobActive, finishCancelledJob } from "./job-control";
import { artifactStore, MEDIA_LIMITS } from "./media-io";
import { cartoonFalClient, runFalStage } from "./cartoon-fal";
import { downloadCartoonVideo } from "./cartoon-media";
import { adRemakeRenderArgs, wrapRemakeCta } from "./ad-remake-render";

const exec = promisify(execFile), outputSchema = z.object({ seconds: z.number().min(3).max(15) });
function database() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Worker database configuration is missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const adRemakePipeline = schemaTask({
  id: "ad-remake-pipeline", schema: z.object({ generationId: z.uuid() }), machine: "medium-2x", maxDuration: 3600,
  queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 10000 },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(database(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    const output = result.ok ? outputSchema.parse(result.data) : null;
    const settled = await database().rpc("finish_ad_remake_job", { job_id: payload.generationId, succeeded: result.ok, result_seconds: output?.seconds ?? null });
    if (settled.error) throw new Error("Ad Remake credit settlement failed. Contact support with the job ID.");
  },
  run: async ({ generationId }, { signal, ctx }) => {
    const db = database(); await claimJob(db, generationId, ctx.run.id, ctx.attempt.number);
    const checkpoint = () => assertJobActive(db, generationId, signal);
    const { data: job, error } = await db.from("generations").select("*").eq("id", generationId).single();
    if (error || !job || job.operation !== "ad-remake-render") throw new Error("Ad Remake job not found");
    const settings = z.object({ brief: adRemakeBriefSchema, sourcePath: z.string(), imagePaths: z.array(z.string()).min(1).max(4) }).parse(job.settings);
    const b = settings.brief, bucket = db.storage.from("private-media"), owner = `${job.workspace_id}/${job.requested_by}/`;
    const prefix = `${owner}ad-remake/${generationId}`, inputRoot = `${owner}ad-remake-inputs/`;
    if (settings.imagePaths.length !== b.productAssetIds.length || [settings.sourcePath, ...settings.imagePaths].some(p => !p.startsWith(inputRoot) || p.includes("..") || /[\\%\u0000-\u001f]/.test(p) || p.slice(inputRoot.length).includes("/"))) throw new Error("Remake input ownership mismatch");
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint), inputs = artifactStore(bucket, inputRoot.slice(0, -1), signal, checkpoint);
    const phase = async (label: string) => {
      await checkpoint(); metadata.set("phase", label);
      if ((await db.from("generations").update({ settings: { ...job.settings, phase: label, artifactPrefix: prefix } }).eq("id", generationId)).error) throw new Error("Could not update remake progress");
    };
    const save = async (name: string, value: unknown) => {
      await checkpoint(); const body = JSON.stringify(value); if (Buffer.byteLength(body) > MEDIA_LIMITS.json) throw new Error("Remake checkpoint too large");
      if ((await bucket.upload(`${prefix}/${name}`, body, { contentType: "application/json", upsert: true })).error) throw new Error("Could not save remake checkpoint");
    };
    const signed = async (name: string) => {
      const result = await bucket.createSignedUrl(`${prefix}/${name}`, 7200); if (result.error || !result.data) throw new Error("Could not read a private remake asset"); return result.data.signedUrl;
    };
    const cached = await artifacts.load("result.json"); if (cached) return outputSchema.parse(JSON.parse(cached.toString()));
    const work = await mkdtemp(path.join(tmpdir(), "eta-ad-remake-"));
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const probe = async (file: string) => {
      const info = await exec(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file], { cwd: work, signal, timeout: 30_000, maxBuffer: 256 * 1024 });
      return z.object({ streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })), format: z.object({ duration: z.string().optional() }) }).parse(JSON.parse(info.stdout));
    };
    try {
      await phase("Checking your reference clip and product images");
      if (!await inputs.loadFile(settings.sourcePath.slice(inputRoot.length), path.join(work, "source.mp4"), AD_REMAKE_MAX_BYTES)) throw new Error("Reference upload is missing");
      const source = await probe("source.mp4"), stream = source.streams.find(s => s.codec_type === "video"), seconds = Number(source.format.duration);
      validateAdRemakeSource({ seconds, width: stream?.width || 0, height: stream?.height || 0 }, b.seconds);
      // Normalize private inputs before the provider sees them. Strip metadata;
      // FFmpeg cannot follow remote resources embedded in a user-supplied file.
      await exec(ffmpeg, ["-y", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", "source.mp4", "-map", "0:v:0", ...(b.keepAudio ? ["-map", "0:a:0?", "-c:a", "aac"] : ["-an"]), "-map_metadata", "-1", "-t", String(seconds), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "reference.mp4"], { cwd: work, signal, timeout: 180_000, maxBuffer: 256 * 1024 });
      await artifacts.saveFile("reference.mp4", path.join(work, "reference.mp4"), "video/mp4", AD_REMAKE_MAX_BYTES);
      const images: string[] = [];
      for (const [i, p] of settings.imagePaths.entries()) {
        await checkpoint(); const file = path.join(work, `input-${i}.image`);
        if (!await inputs.loadFile(p.slice(inputRoot.length), file, 8 * 1024 * 1024)) throw new Error("Product image upload is missing");
        const handle = await open(file, "r");
        try { const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0); imageMime(header); } finally { await handle.close(); }
        const info = (await probe(file)).streams.find(s => s.codec_type === "video");
        if (!info?.width || !info.height || info.width * info.height > 20_000_000 || Math.min(info.width, info.height) < 100) throw new Error("Product images must be at least 100px per side and at most 20 megapixels");
        await exec(ffmpeg, ["-y", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", file, "-frames:v", "1", "-vf", "scale=1536:1536:force_original_aspect_ratio=decrease", `product-${i}.png`], { cwd: work, signal, timeout: 30_000, maxBuffer: 256 * 1024 });
        await artifacts.saveFile(`product-${i}.png`, path.join(work, `product-${i}.png`), "image/png", MEDIA_LIMITS.image);
        images.push(await signed(`product-${i}.png`));
      }
      const raw = path.join(work, "edited.mp4");
      if (!await artifacts.loadFile("edited.mp4", raw, MEDIA_LIMITS.video)) {
        await phase(`Remaking your ad with ${adRemakeModels[b.model].name}`);
        const result = z.object({ video: z.object({ url: z.string().url() }) }).parse(await runFalStage({ name: "remake", endpoint: adRemakeModels[b.model].endpoint,
          input: adRemakeInput(b, await signed("reference.mp4"), images), client: cartoonFalClient(), store: { load: artifacts.load, save }, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) }));
        await downloadCartoonVideo(result.video.url, raw, signal);
        const rendered = await probe("edited.mp4");
        if (!rendered.streams.some(s => s.codec_type === "video") || !Number.isFinite(Number(rendered.format.duration)) || Math.abs(Number(rendered.format.duration) - seconds) > .3) throw new Error("Model returned incomplete or mismatched footage");
        await artifacts.saveFile("edited.mp4", raw, "video/mp4", MEDIA_LIMITS.video);
      }
      await phase("Preparing your private MP4 and disclosure");
      await writeFile(path.join(work, "cta.txt"), wrapRemakeCta(b.cta));
      const scale = Math.min(1, 1920 / Math.max(stream!.width!, stream!.height!));
      const width = Math.floor(stream!.width! * scale / 2) * 2, height = Math.floor(stream!.height! * scale / 2) * 2;
      await exec(ffmpeg, adRemakeRenderArgs(b, seconds, width, height, source.streams.some(s => s.codec_type === "audio")), { cwd: work, signal, timeout: 180_000, maxBuffer: 256 * 1024 });
      const final = await probe("remake.mp4");
      if (!Number.isFinite(Number(final.format.duration)) || Math.abs(Number(final.format.duration) - seconds) > .15 || !final.streams.some(s => s.codec_type === "video")) throw new Error("Remake export validation failed");
      await artifacts.saveFile("remake.mp4", path.join(work, "remake.mp4"), "video/mp4", MEDIA_LIMITS.video);
      const output = { seconds }; await save("result.json", output); return output;
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
