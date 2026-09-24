import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { schemaTask, wait, metadata, logger, AbortTaskRunError } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cartoonBriefSchema, cartoonStorySchema, validateCartoonStory, CHARACTER_IMAGE_MODEL, type CartoonStory } from "../src/lib/cartoons/schema";
import { cartoonPlannerPrompt, characterImagePrompt, sceneImagePrompt, cartoonVideoInput } from "../src/lib/cartoons/prompts";
import { artifactStore, downloadProviderImage, readBoundedBody, MEDIA_LIMITS } from "./media-io";
import { assertJobActive, claimJob, finishCancelledJob } from "./job-control";
import { cartoonFalClient, CartoonProviderError, runFalStage } from "./cartoon-fal";
import { cartoonClipArgs, downloadCartoonVideo } from "./cartoon-media";
import { CARTOON_PLANNER_MODEL, CartoonPlannerError, runCartoonPlanner, type PlannerInput } from "./cartoon-planner";
import { withRequestDeadline } from "./request-deadline";

const exec = promisify(execFile);
function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Worker Supabase credentials are missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const pathsSchema = z.record(z.string().regex(/^c[1-3]$/), z.string());
const outputSchema = z.object({ storyboard: cartoonStorySchema.nullable(), castPaths: pathsSchema.nullable(), outputPath: z.string().nullable() });
const imageResult = z.object({ images: z.array(z.object({ url: z.string().url() })).min(1), has_nsfw_concepts: z.array(z.boolean()).optional() });

export const cartoonPipeline = schemaTask({
  id: "cartoon-pipeline", schema: z.object({ generationId: z.string().uuid() }),
  machine: "medium-2x", maxDuration: 3600, queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 10000 },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(database(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    const output = result.ok ? outputSchema.parse(result.data) : null;
    const { error } = await database().rpc("finish_cartoon_job", { job_id: payload.generationId, succeeded: result.ok,
      result_storyboard: output?.storyboard ?? null, result_cast: output?.castPaths ?? null, result_path: output?.outputPath ?? null });
    if (error) throw new Error("Cartoon job settlement failed; contact support with the job ID.");
  },
  run: async ({ generationId }, { signal, ctx }) => {
    const db = database();
    await claimJob(db, generationId, ctx.run.id, ctx.attempt.number);
    const checkpoint = () => assertJobActive(db, generationId, signal);
    const { data: job, error } = await db.from("generations").select("*").eq("id", generationId).single();
    if (error || !job || !["cartoon-plan", "cartoon-render"].includes(job.operation)) throw new Error("Cartoon job not found");
    const settings = z.object({ projectId: z.string().uuid(), kind: z.enum(["plan", "render"]), brief: cartoonBriefSchema, storyboard: cartoonStorySchema.nullable(), castPaths: pathsSchema }).parse(job.settings);
    const { brief } = settings;
    const bucket = db.storage.from("private-media");
    const ownerPrefix = `${job.workspace_id}/${job.requested_by}/`;
    const prefix = `${ownerPrefix}cartoons/${generationId}`;
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint);
    async function save(name: string, value: unknown) {
      await checkpoint();
      const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MEDIA_LIMITS.json) throw new Error("Cartoon checkpoint exceeds size limit");
      const saved = await bucket.upload(`${prefix}/${name}`, body, { contentType: "application/json", upsert: true });
      if (saved.error) throw new Error("Could not save cartoon checkpoint");
    }
    async function phase(label: string) {
      await checkpoint(); metadata.set("phase", label);
      const updated = await db.from("generations").update({ settings: { ...job.settings, phase: label, artifactPrefix: prefix } }).eq("id", generationId);
      if (updated.error) throw new Error("Could not save progress");
    }
    async function signed(storagePath: string) {
      if (!storagePath.startsWith(ownerPrefix) || storagePath.includes("..")) throw new Error("Reference ownership mismatch");
      const { data, error: signError } = await bucket.createSignedUrl(storagePath, 7200);
      if (signError || !data) throw new Error("Could not read private character reference");
      return data.signedUrl;
    }
    const cached = await artifacts.load("result.json");
    if (cached) return outputSchema.parse(JSON.parse(cached.toString()));
    const client = cartoonFalClient();
    const work = await mkdtemp(path.join(tmpdir(), "cartoon-"));
    async function provider(name: string, endpoint: string, input: Record<string, unknown>) {
      return runFalStage({ client, store: { load: artifacts.load, save }, name, endpoint, input, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) });
    }
    async function image(name: string, prompt: string, references: string[], portrait: boolean) {
      const file = path.join(work, `${name}.png`);
      if (!await artifacts.loadFile(`${name}.png`, file, MEDIA_LIMITS.image)) {
        const result = imageResult.parse(await provider(name, `${CHARACTER_IMAGE_MODEL}/${references.length ? "edit" : "text-to-image"}`, {
          prompt, ...(references.length ? { image_urls: references } : {}), image_size: portrait ? { width: 1024, height: 1024 } : brief.aspectRatio === "9:16" ? { width: 720, height: 1280 } : { width: 1280, height: 720 }, quality: "high", num_images: 1, output_format: "png",
        }));
        if (result.has_nsfw_concepts?.some(Boolean)) throw new Error("Image rejected by safety filter");
        await downloadProviderImage(result.images[0].url, file, signal);
        await artifacts.saveFile(`${name}.png`, file, "image/png", MEDIA_LIMITS.image);
      }
      return `${prefix}/${name}.png`;
    }
    try {
      if (settings.kind === "plan") {
        await phase("Writing your cast, actions and dialogue");
        const references: { path: string; mime: string }[] = [];
        for (const ref of brief.references) {
          const asset = await db.from("assets").select("storage_path,mime_type,byte_size").eq("id", ref.assetId).eq("owner_id", job.requested_by).eq("workspace_id", job.workspace_id).eq("kind", "reference").is("deleted_at", null).single();
          if (asset.error || !asset.data || !["image/png", "image/jpeg", "image/webp"].includes(asset.data.mime_type) || Number(asset.data.byte_size) > 8 * 1024 * 1024) throw new Error("Character upload unavailable");
          references.push({ path: asset.data.storage_path, mime: asset.data.mime_type });
        }
        let story: CartoonStory;
        const planned = await artifacts.load("story.json");
        if (planned) story = cartoonStorySchema.parse(JSON.parse(planned.toString()));
        else {
          const input: PlannerInput = [{ type: "text", text: cartoonPlannerPrompt(brief) }];
          for (const ref of references) {
            await checkpoint();
            if (!ref.path.startsWith(ownerPrefix)) throw new Error("Reference ownership mismatch");
            const bytes = await withRequestDeadline(signal, 60_000, async (refSignal) => {
              const response = await bucket.download(ref.path, {}, { signal: refSignal }).asStream();
              if (response.error || !response.data) throw new Error("Character image upload did not finish");
              return readBoundedBody(response.data, 8 * 1024 * 1024, refSignal);
            });
            input.push({ type: "image", data: bytes.toString("base64"), mime_type: ref.mime });
          }
          logger.info("Cartoon planner started", { generationId, provider: "fal", model: CARTOON_PLANNER_MODEL });
          let outputText: string;
          try {
            outputText = await runCartoonPlanner({ input, client, signal, store: { load: artifacts.load, save }, checkpoint, pause: () => wait.for({ seconds: 10 }) });
          } catch (error) {
            if (error instanceof CartoonProviderError) {
              logger.error("Cartoon planner provider failed", { generationId, provider: "fal", model: CARTOON_PLANNER_MODEL, requestId: error.requestId, httpStatus: error.httpStatus });
              throw error; // Retry may recover the saved fal request, never submit it twice.
            }
            if (!(error instanceof CartoonPlannerError)) throw error;
            logger.error("Cartoon planner failed", { generationId, provider: "fal", model: CARTOON_PLANNER_MODEL, code: error.code });
            // Repeating a rejected/uncertain planner POST is not a recovery path.
            throw new AbortTaskRunError(error.message);
          }
          logger.info("Cartoon planner response saved", { generationId, provider: "fal", model: CARTOON_PLANNER_MODEL });
          story = cartoonStorySchema.parse(JSON.parse(outputText));
          validateCartoonStory(story, brief); await save("story.json", story);
        }
        validateCartoonStory(story, brief);
        const castPaths: Record<string, string> = {};
        for (const character of story.characters) {
          await phase(`Designing ${character.name} (${Object.keys(castPaths).length + 1}/${story.characters.length})`);
          const refs = character.referenceSlot ? [await signed(references[character.referenceSlot - 1].path)] : [];
          castPaths[character.id] = await image(`cast-${character.id}`, characterImagePrompt(character, brief), refs, true);
        }
        const result = { storyboard: story, castPaths, outputPath: null };
        await save("result.json", result); return result;
      }
      const story = cartoonStorySchema.parse(settings.storyboard);
      validateCartoonStory(story, brief);
      for (const [index, scene] of story.scenes.entries()) {
        await phase(`Animating scene ${index + 1} of ${story.scenes.length}`);
        const clip = path.join(work, `clip-${index}.mp4`);
        if (await artifacts.loadFile(`clip-${index}.mp4`, clip, MEDIA_LIMITS.video)) continue;
        const refs = await Promise.all(scene.characterIds.map((id) => signed(settings.castPaths[id])));
        const frame = await image(`frame-${index}`, sceneImagePrompt(scene, story, brief), refs, false);
        const raw = path.join(work, `raw-${index}.mp4`);
        if (!await artifacts.loadFile(`raw-${index}.mp4`, raw, MEDIA_LIMITS.video)) {
          const request = cartoonVideoInput(scene, story, brief, await signed(frame), refs, job.requested_by);
          const result = z.object({ video: z.object({ url: z.string().url() }) }).parse(await provider(`video-${index}`, request.endpoint, request.input));
          await downloadCartoonVideo(result.video.url, raw, signal);
          await artifacts.saveFile(`raw-${index}.mp4`, raw, "video/mp4", MEDIA_LIMITS.video);
        }
        await checkpoint();
        const probe = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", `raw-${index}.mp4`], { cwd: work, signal, timeout: 30_000, maxBuffer: 256 * 1024 });
        const media = z.object({ streams: z.array(z.object({ codec_type: z.string() })), format: z.object({ duration: z.string() }) }).parse(JSON.parse(probe.stdout));
        const seconds = Number(media.format.duration);
        if (!Number.isFinite(seconds) || seconds < scene.duration - 1 || seconds > scene.duration + 3 || !media.streams.some((s) => s.codec_type === "audio")) throw new Error("Provider returned an incomplete clip or missing audio");
        await exec(process.env.FFMPEG_PATH || "ffmpeg", cartoonClipArgs(index, scene.duration, brief.aspectRatio === "9:16"), { cwd: work, signal, timeout: 180_000, maxBuffer: 256 * 1024 });
        await artifacts.saveFile(`clip-${index}.mp4`, clip, "video/mp4", MEDIA_LIMITS.video);
      }
      await phase("Assembling your cartoon with dialogue");
      await writeFile(path.join(work, "concat.txt"), story.scenes.map((_, i) => `file 'clip-${i}.mp4'`).join("\n"));
      await exec(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", "video.mp4"], { cwd: work, signal, timeout: 120_000, maxBuffer: 256 * 1024 });
      await artifacts.saveFile("video.mp4", path.join(work, "video.mp4"), "video/mp4", MEDIA_LIMITS.video);
      const result = { storyboard: null, castPaths: null, outputPath: `${prefix}/video.mp4` };
      await save("result.json", result); return result;
    } finally {
      // mkdtemp returns this task's exclusive directory, never a supplied path.
      await rm(work, { recursive: true, force: true });
    }
  },
});
