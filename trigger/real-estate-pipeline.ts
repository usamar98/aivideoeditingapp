import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { schemaTask, metadata, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { estateBriefSchema, estateSeconds, estateVideoInput, ESTATE_TTS } from "../src/lib/real-estate/schema";
import { filmModels } from "../src/lib/films/models";
import { imageMime } from "../src/lib/ugc/images";
import { assertJobActive, claimJob, finishCancelledJob } from "./job-control";
import { artifactStore, MEDIA_LIMITS, streamToFile } from "./media-io";
import { cartoonFalClient, runFalStage } from "./cartoon-fal";
import { downloadCartoonVideo, isCartoonMediaUrl } from "./cartoon-media";
import { estateCaptions, estateClipArgs, estateJoinArgs, wrapEstateText } from "./real-estate-render";

const exec = promisify(execFile), MAX_EXPORT = 400 * 1024 * 1024;
const resultSchema = z.object({ seconds: z.number().min(16).max(100) });
function database() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Worker database credentials are missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const realEstatePipeline = schemaTask({
  id: "real-estate-pipeline", schema: z.object({ generationId: z.uuid() }), machine: "medium-2x", maxDuration: 14400,
  queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 10000 },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(database(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    const output = result.ok ? resultSchema.parse(result.data) : null;
    const settled = await database().rpc("finish_real_estate_job", { job_id: payload.generationId, succeeded: result.ok, result_seconds: output?.seconds ?? null });
    if (settled.error) throw new Error("Listing credit settlement failed. Contact support with the job ID.");
  },
  run: async ({ generationId }, { signal, ctx }) => {
    const db = database(); await claimJob(db, generationId, ctx.run.id, ctx.attempt.number);
    const { data: job, error } = await db.from("generations").select("*").eq("id", generationId).single();
    if (error || !job || job.operation !== "real-estate-render") throw new Error("Listing job not found");
    const { brief, photoPaths } = z.object({ brief: estateBriefSchema, photoPaths: z.array(z.string()).min(2).max(12) }).parse(job.settings);
    const bucket = db.storage.from("private-media"), owner = `${job.workspace_id}/${job.requested_by}/`, prefix = `${owner}real-estate/${generationId}`;
    if (photoPaths.length !== brief.rooms.length || photoPaths.some(p => !p.startsWith(`${owner}real-estate-inputs/`) || p.includes("..") || p.includes("\\"))) throw new Error("Invalid listing photo ownership");
    const checkpoint = () => assertJobActive(db, generationId, signal);
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint);
    const save = async (name: string, value: unknown) => {
      await checkpoint(); const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MEDIA_LIMITS.json) throw new Error("Listing checkpoint too large");
      if ((await bucket.upload(`${prefix}/${name}`, body, { contentType: "application/json", upsert: true })).error) throw new Error("Could not save listing progress");
    };
    const phase = async (label: string) => {
      await checkpoint(); metadata.set("phase", label);
      if ((await db.from("generations").update({ settings: { ...job.settings, phase: label } }).eq("id", generationId)).error) throw new Error("Could not save listing status");
    };
    const signed = async (name: string) => {
      await checkpoint(); const url = await bucket.createSignedUrl(`${prefix}/${name}`, 7200);
      if (url.error || !url.data) throw new Error("Private listing media unavailable"); return url.data.signedUrl;
    };
    const cached = await artifacts.load("result.json"); if (cached) return resultSchema.parse(JSON.parse(cached.toString()));
    // No fal credential or paid request is needed for silent faithful-photo exports.
    const client = brief.model !== "photo-motion" || brief.voice !== "none" ? cartoonFalClient() : null;
    const work = await mkdtemp(path.join(tmpdir(), "eta-real-estate-"));
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const probe = async (file: string) => {
      const p = await exec(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file], { cwd: work, timeout: 30000, signal, maxBuffer: 256 * 1024 });
      return z.object({ format: z.object({ duration: z.string().optional() }), streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })) }).parse(JSON.parse(p.stdout));
    };
    const render = (args: string[]) => exec(ffmpeg, args, { cwd: work, timeout: 300000, signal, maxBuffer: 256 * 1024 });
    try {
      // Validate ALL source files before submitting any paid generation.
      await phase("Checking the original property photos");
      const sources = artifactStore(bucket, `${owner}real-estate-inputs`, signal, checkpoint);
      for (let i = 0; i < brief.rooms.length; i++) {
        await checkpoint(); const input = `source-${i}`, photo = `photo-${i}.png`;
        if (!await sources.loadFile(path.basename(photoPaths[i]), path.join(work, input), 8 * 1024 * 1024)) throw new Error("A property photo upload is missing");
        const file = await open(path.join(work, input), "r");
        try { const header = Buffer.alloc(32); await file.read(header, 0, 32, 0); imageMime(header); } finally { await file.close(); }
        const info = (await probe(input)).streams.find(s => s.codec_type === "video");
        if (!info?.width || !info.height || info.width * info.height > 20000000 || Math.min(info.width, info.height) < 256) throw new Error("Use property photos between 256px per side and 20 megapixels");
        await render(["-y", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-frames:v", "1", "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease", "-map_metadata", "-1", photo]);
        await artifacts.saveFile(photo, path.join(work, photo), "image/png", MEDIA_LIMITS.image);
      }
      await writeFile(path.join(work, "brand.txt"), wrapEstateText(brief.agent || brief.title, brief.aspectRatio === "9:16" ? 44 : 75));
      const columns = brief.aspectRatio === "9:16" ? 34 : 65;
      await writeFile(path.join(work, "outro.txt"), [brief.title, brief.address, brief.price, "", brief.cta, brief.agent, brief.contact].map(t => wrapEstateText(t, columns)).join("\n"));
      for (let i = 0; i < brief.rooms.length; i++) {
        await phase(`Preparing room ${i + 1} of ${brief.rooms.length}`);
        if (await artifacts.loadFile(`clip-${i}.mp4`, path.join(work, `clip-${i}.mp4`), MEDIA_LIMITS.video)) continue;
        if (brief.voice !== "none") {
          if (!await artifacts.loadFile(`voice-${i}.mp3`, path.join(work, `voice-${i}.mp3`), MEDIA_LIMITS.voice)) {
            const result = z.object({ audio: z.object({ url: z.url() }) }).parse(await runFalStage({ client: client!, store: { load: artifacts.load, save }, name: `voice-${i}`, endpoint: ESTATE_TTS,
              input: { text: brief.rooms[i].narration, voice: brief.voice, stability: .7, language_code: "en" }, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) }));
            if (!isCartoonMediaUrl(result.audio.url)) throw new Error("Unexpected narration host");
            const transfer = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
            const response = await fetch(result.audio.url, { redirect: "error", signal: transfer });
            if (!response.ok || !response.body || !/^(audio\/|application\/octet-stream)/.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Error("Narration download failed"); }
            await streamToFile(response.body, path.join(work, `voice-${i}.mp3`), MEDIA_LIMITS.voice, transfer);
            await artifacts.saveFile(`voice-${i}.mp3`, path.join(work, `voice-${i}.mp3`), "audio/mpeg", MEDIA_LIMITS.voice);
          }
          const seconds = Number((await probe(`voice-${i}.mp3`)).format.duration);
          if (!Number.isFinite(seconds) || seconds < .1 || seconds > brief.secondsPerRoom) throw new Error("Room narration is too long. Shorten it before creating a new listing; no words will be cut off.");
        }
        if (brief.model !== "photo-motion") {
          if (!await artifacts.loadFile(`raw-${i}.mp4`, path.join(work, `raw-${i}.mp4`), MEDIA_LIMITS.video)) {
            const result = z.object({ video: z.object({ url: z.url() }) }).parse(await runFalStage({ client: client!, store: { load: artifacts.load, save }, name: `motion-${i}`, endpoint: filmModels[brief.model].endpoint,
              input: estateVideoInput(brief, i, await signed(`photo-${i}.png`), job.requested_by), signal, checkpoint, pause: () => wait.for({ seconds: 10 }) }));
            await downloadCartoonVideo(result.video.url, path.join(work, `raw-${i}.mp4`), signal);
            await artifacts.saveFile(`raw-${i}.mp4`, path.join(work, `raw-${i}.mp4`), "video/mp4", MEDIA_LIMITS.video);
          }
          const raw = await probe(`raw-${i}.mp4`), seconds = Number(raw.format.duration);
          if (!Number.isFinite(seconds) || seconds < brief.secondsPerRoom - .12 || !raw.streams.some(s => s.codec_type === "video")) throw new Error("Provider returned an incomplete room video");
        }
        await writeFile(path.join(work, `label-${i}.txt`), wrapEstateText(brief.rooms[i].label, columns));
        await checkpoint(); await render(estateClipArgs(brief, i, brief.voice !== "none"));
        await artifacts.saveFile(`clip-${i}.mp4`, path.join(work, `clip-${i}.mp4`), "video/mp4", MEDIA_LIMITS.video);
      }
      await phase("Adding your contact card and verifying the export");
      await render(estateClipArgs(brief, 0, false, true));
      await writeFile(path.join(work, "clips.txt"), [...brief.rooms.map((_, i) => `file 'clip-${i}.mp4'`), "file 'outro.mp4'"].join("\n"));
      await render(estateJoinArgs()); const final = await probe("listing.mp4"), seconds = estateSeconds(brief);
      const size = final.streams.find(s => s.codec_type === "video");
      if (Math.abs(Number(final.format.duration) - seconds) > .3 || !size || !final.streams.some(s => s.codec_type === "audio") || size.width !== (brief.aspectRatio === "9:16" ? 1080 : 1920)) throw new Error("Listing export validation failed");
      await artifacts.saveFile("listing.mp4", path.join(work, "listing.mp4"), "video/mp4", MAX_EXPORT);
      await writeFile(path.join(work, "captions.srt"), estateCaptions(brief));
      await artifacts.saveFile("captions.srt", path.join(work, "captions.srt"), "application/x-subrip", MEDIA_LIMITS.json);
      const output = { seconds }; await save("result.json", output); return output;
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
