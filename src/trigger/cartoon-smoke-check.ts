import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { schemaTask, wait, metadata } from "@trigger.dev/sdk";
import { z } from "zod";
import { cartoonFalClient, runFalStage } from "../../trigger/cartoon-fal";
import { artifactStore, downloadProviderImage, MEDIA_LIMITS } from "../../trigger/media-io";
import { cartoonClipArgs, downloadCartoonVideo } from "../../trigger/cartoon-media";
import { CHARACTER_IMAGE_MODEL } from "../lib/cartoons/schema";
import { cartoonDemo } from "../lib/cartoons/demo";
import { cartoonVideoInput } from "../lib/cartoons/prompts";

const exec = promisify(execFile);
// Explicit owner approval: one <=$5 fal smoke test, September 24, 2026.
// Fixed prompts/outputs: two 1024px high-quality images + one 5s Kling O3
// native-audio clip ($0.70 video; image token pricing adds a small amount).
// No arbitrary payload, batch, retries, user generations, ledger or subscriptions.
export const cartoonSmokeCheck = schemaTask({
  id: "cartoon-smoke-check", schema: z.object({ confirmation: z.literal("APPROVED_ONE_TEST_MAX_USD_5_20260924") }),
  machine: "medium-2x", maxDuration: 900, retry: { maxAttempts: 1 }, queue: { concurrencyLimit: 1 },
  run: async (_payload, { signal }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Smoke test storage credentials are missing");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const bucket = db.storage.from("private-media");
    const prefix = "diagnostics/cartoon-smoke-20260924-v1";
    const client = cartoonFalClient();
    const checkpoint = async () => { signal.throwIfAborted(); };
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint);
    const existing = await artifacts.load("verification.json");
    if (existing) return JSON.parse(existing.toString()) as Record<string, unknown>;
    const lock = await bucket.upload(`${prefix}/one-use-lock.json`, JSON.stringify({ approvedBudgetUsd: 5, createdAt: new Date().toISOString() }), { contentType: "application/json", upsert: false });
    if (lock.error) throw new Error("Smoke budget lock already exists or storage is unavailable. No provider requests sent. Do not retry with another lock without approval.");
    const work = await mkdtemp(path.join(tmpdir(), "cartoon-smoke-"));
    async function save(name: string, value: unknown) {
      await checkpoint();
      const result = await bucket.upload(`${prefix}/${name}`, JSON.stringify(value), { contentType: "application/json", upsert: true });
      if (result.error) throw new Error("Could not save smoke checkpoint");
    }
    async function signed(name: string) {
      const result = await bucket.createSignedUrl(`${prefix}/${name}`, 3600);
      if (result.error || !result.data) throw new Error("Smoke preview signing failed");
      return result.data.signedUrl;
    }
    async function provider(name: string, endpoint: string, input: Record<string, unknown>) {
      metadata.set("phase", name);
      return runFalStage({ client, store: { load: artifacts.load, save }, name, endpoint, input, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) });
    }
    try {
      const portrait = z.object({ images: z.array(z.object({ url: z.string().url() })).min(1) }).parse(await provider("portrait", `${CHARACTER_IMAGE_MODEL}/text-to-image`, {
        prompt: "An original small orange fox astronaut, cream muzzle, blue spacesuit, clear helmet. Polished expressive 3D cartoon character, full body, front three-quarter view, neutral cream background. One character, no text or watermark.",
        image_size: { width: 1024, height: 1024 }, quality: "high", num_images: 1, output_format: "png",
      }));
      await downloadProviderImage(portrait.images[0].url, path.join(work, "portrait.png"), signal);
      await artifacts.saveFile("portrait.png", path.join(work, "portrait.png"), "image/png", MEDIA_LIMITS.image);
      const portraitUrl = await signed("portrait.png");
      const frame = z.object({ images: z.array(z.object({ url: z.string().url() })).min(1) }).parse(await provider("reference-edit", `${CHARACTER_IMAGE_MODEL}/edit`, {
        prompt: "Use the exact fox astronaut in the reference: same face, orange fur, blue spacesuit and proportions. Full-body cinematic 3D cartoon shot of this single character standing on a soft marshmallow moon beneath a blue star field. No text or watermark.",
        image_urls: [portraitUrl], image_size: { width: 1280, height: 720 }, quality: "high", num_images: 1, output_format: "png",
      }));
      await downloadProviderImage(frame.images[0].url, path.join(work, "frame.png"), signal);
      await artifacts.saveFile("frame.png", path.join(work, "frame.png"), "image/png", MEDIA_LIMITS.image);
      const scene = { ...cartoonDemo.storyboard!.scenes[0], characterIds: ["c1"], action: "Nova takes a gentle step, bounces softly, then smiles at the camera." };
      const videoInput = cartoonVideoInput(scene, cartoonDemo.storyboard!, cartoonDemo.brief, await signed("frame.png"), [portraitUrl], "owner-approved-smoke-test");
      const video = z.object({ video: z.object({ url: z.string().url() }) }).parse(await provider("native-audio-video", videoInput.endpoint, videoInput.input));
      await downloadCartoonVideo(video.video.url, path.join(work, "raw-0.mp4"), signal);
      await exec(process.env.FFMPEG_PATH || "ffmpeg", cartoonClipArgs(0, 5, false), { cwd: work, signal, timeout: 120000, maxBuffer: 256 * 1024 });
      const probe = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", "clip-0.mp4"], { cwd: work, signal, timeout: 30000, maxBuffer: 256 * 1024 });
      const media = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string(), width: z.number().optional(), height: z.number().optional() })), format: z.object({ duration: z.string() }) }).parse(JSON.parse(probe.stdout));
      if (!media.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac") || !media.streams.some((s) => s.width === 1280 && s.height === 720) || Number(media.format.duration) < 4.9 || Number(media.format.duration) > 5.2) throw new Error("Smoke output failed audio/video verification");
      await artifacts.saveFile("smoke.mp4", path.join(work, "clip-0.mp4"), "video/mp4", MEDIA_LIMITS.video);
      const result = { ok: true, imageModel: CHARACTER_IMAGE_MODEL, videoModel: videoInput.endpoint, providerRequests: 3, videoSeconds: 5, media, storagePath: `${prefix}/smoke.mp4`, previewUrl: await signed("smoke.mp4"), node: process.versions.node };
      await save("verification.json", result); return result;
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
