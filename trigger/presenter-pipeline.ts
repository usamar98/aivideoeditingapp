import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { schemaTask, metadata, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { presenterBriefSchema, PRESENTER_MODEL, PRESENTER_CONSENT_VERSION } from "../src/lib/presenter/schema";
import { alignmentSchema, alignmentToSrt } from "../src/lib/faceless/captions";
import { imageMime } from "../src/lib/ugc/images";
import { assertJobActive, claimJob, finishCancelledJob } from "./job-control";
import { artifactStore, MEDIA_LIMITS, readBoundedBody } from "./media-io";
import { cartoonFalClient, runFalStage } from "./cartoon-fal";
import { downloadCartoonVideo } from "./cartoon-media";
import { withRequestDeadline } from "./request-deadline";
import { presenterRenderArgs } from "./presenter-render";

const exec = promisify(execFile);
const resultSchema = z.object({ seconds: z.number().min(2).max(30) });
const speechSchema = z.object({ audio_base64: z.string().min(1), alignment: alignmentSchema.nullish(), normalized_alignment: alignmentSchema.nullish() });
function database() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Worker database credentials are missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const presenterPipeline = schemaTask({
  id: "presenter-pipeline", schema: z.object({ generationId: z.uuid() }), machine: "medium-2x", maxDuration: 5400,
  queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 10000 },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(database(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    const output = result.ok ? resultSchema.parse(result.data) : null;
    const settled = await database().rpc("finish_presenter_job", { job_id: payload.generationId, succeeded: result.ok, result_seconds: output?.seconds ?? null });
    if (settled.error) throw new Error("Presenter credit settlement failed. Contact support with the job ID.");
  },
  run: async ({ generationId }, { signal, ctx }) => {
    const db = database(); await claimJob(db, generationId, ctx.run.id, ctx.attempt.number);
    const { data: job, error } = await db.from("generations").select("*").eq("id", generationId).single();
    if (error || !job || job.operation !== "presenter-render") throw new Error("Presenter job not found");
    const settings = z.object({ presenterId: z.uuid(), portraitPath: z.string(), consentVersion: z.literal(PRESENTER_CONSENT_VERSION), brief: presenterBriefSchema }).parse(job.settings);
    const { brief } = settings, bucket = db.storage.from("private-media");
    const ownerPrefix = `${job.workspace_id}/${job.requested_by}/`, prefix = `${ownerPrefix}presenter/${generationId}`;
    if (!settings.portraitPath.startsWith(`${ownerPrefix}presenter-inputs/`) || settings.portraitPath.includes("..")) throw new Error("Invalid portrait ownership");
    const checkpoint = async () => {
      await assertJobActive(db, generationId, signal);
      const consent = await db.from("presenters").select("id").eq("id", settings.presenterId).eq("user_id", job.requested_by).eq("workspace_id", job.workspace_id).eq("portrait_path", settings.portraitPath).eq("consent_version", PRESENTER_CONSENT_VERSION).is("revoked_at", null).maybeSingle();
      if (consent.error || !consent.data) throw new Error("Presenter permission could not be confirmed");
    };
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint);
    const save = async (name: string, value: unknown) => {
      await checkpoint(); const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MEDIA_LIMITS.voice) throw new Error("Presenter checkpoint too large");
      if ((await bucket.upload(`${prefix}/${name}`, body, { contentType: "application/json", upsert: true })).error) throw new Error("Could not save presenter progress");
    };
    const phase = async (label: string) => {
      await checkpoint(); metadata.set("phase", label);
      if ((await db.from("generations").update({ settings: { ...job.settings, phase: label, artifactPrefix: prefix } }).eq("id", generationId)).error) throw new Error("Could not save presenter status");
    };
    const signed = async (name: string) => {
      await checkpoint(); const url = await bucket.createSignedUrl(`${prefix}/${name}`, 7200);
      if (url.error || !url.data) throw new Error("Private presenter media unavailable"); return url.data.signedUrl;
    };
    const cached = await artifacts.load("result.json"); if (cached) return resultSchema.parse(JSON.parse(cached.toString()));
    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_DEFAULT_VOICE_ID) throw new Error("Studio voice is not configured on the worker");
    const client = cartoonFalClient();
    const work = await mkdtemp(path.join(tmpdir(), "eta-presenter-"));
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const probe = async (file: string) => {
      const result = await exec(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file], { cwd: work, timeout: 30_000, signal, maxBuffer: 256 * 1024 });
      return z.object({ format: z.object({ duration: z.string().optional() }), streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })) }).parse(JSON.parse(result.stdout));
    };
    try {
      await phase("Checking and preparing your portrait");
      const input = "portrait-input";
      const sources = artifactStore(bucket, `${ownerPrefix}presenter-inputs`, signal, checkpoint);
      if (!await sources.loadFile(path.basename(settings.portraitPath), path.join(work, input), 8 * 1024 * 1024)) throw new Error("Portrait upload is missing");
      const file = await open(path.join(work, input), "r");
      try { const header = Buffer.alloc(32); await file.read(header, 0, 32, 0); imageMime(header); } finally { await file.close(); }
      const portraitInfo = await probe(input), size = portraitInfo.streams.find(s => s.codec_type === "video");
      if (!size?.width || !size.height || size.width * size.height > 20_000_000 || Math.min(size.width, size.height) < 256) throw new Error("Use a portrait between 256px per side and 20 megapixels");
      await exec(ffmpeg, ["-y", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-frames:v", "1", "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease", "-map_metadata", "-1", "portrait.png"], { cwd: work, timeout: 30_000, signal, maxBuffer: 256 * 1024 });
      await artifacts.saveFile("portrait.png", path.join(work, "portrait.png"), "image/png", MEDIA_LIMITS.image);
      await phase("Creating the studio voice and caption timing");
      let voice = await artifacts.load("voice.json", MEDIA_LIMITS.voice);
      if (!voice) {
        if (await artifacts.load("voice-intent.json")) throw new Error("Voice submission was uncertain; refusing a duplicate charge");
        await save("voice-intent.json", { model: "eleven_multilingual_v2", characters: brief.script.length });
        voice = await withRequestDeadline(signal, 90_000, async requestSignal => {
          await checkpoint();
          const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_DEFAULT_VOICE_ID!)}/with-timestamps`, {
            method: "POST", redirect: "error", signal: requestSignal, headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! }, body: JSON.stringify({ text: brief.script, model_id: "eleven_multilingual_v2", language_code: "en" }),
          });
          if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`Studio voice failed (${response.status})`); }
          return readBoundedBody(response.body, MEDIA_LIMITS.voice, requestSignal);
        });
        await save("voice.json", speechSchema.parse(JSON.parse(voice.toString())));
      }
      const speech = speechSchema.parse(JSON.parse(voice.toString())), timing = speech.normalized_alignment || speech.alignment;
      if (!timing) throw new Error("Caption timing is missing");
      await writeFile(path.join(work, "voice.mp3"), Buffer.from(speech.audio_base64, "base64"));
      const seconds = Number((await probe("voice.mp3")).format.duration);
      if (!Number.isFinite(seconds) || seconds < 2 || seconds > brief.duration) throw new Error("The voice exceeds the selected maximum. Shorten the script and create a new video.");
      await artifacts.saveFile("voice.mp3", path.join(work, "voice.mp3"), "audio/mpeg", MEDIA_LIMITS.voice);
      await writeFile(path.join(work, "captions.srt"), alignmentToSrt(timing));
      await artifacts.saveFile("captions.srt", path.join(work, "captions.srt"), "application/x-subrip", MEDIA_LIMITS.json);
      await phase("Animating your presenter with lip sync");
      const raw = path.join(work, "avatar.mp4");
      if (!await artifacts.loadFile("avatar.mp4", raw, MEDIA_LIMITS.video)) {
        const result = z.object({ video: z.object({ url: z.url() }) }).parse(await runFalStage({ client, store: { load: artifacts.load, save }, name: "avatar", endpoint: PRESENTER_MODEL,
          input: { image_url: await signed("portrait.png"), audio_url: await signed("voice.mp3"), resolution: brief.resolution }, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) }));
        await downloadCartoonVideo(result.video.url, raw, signal);
        await artifacts.saveFile("avatar.mp4", raw, "video/mp4", MEDIA_LIMITS.video);
      }
      const rawInfo = await probe("avatar.mp4"), rawSeconds = Number(rawInfo.format.duration);
      if (!Number.isFinite(rawSeconds) || rawSeconds < seconds - .25 || rawSeconds > brief.duration + 3 || !rawInfo.streams.some(s => s.codec_type === "video")) throw new Error("Provider returned an incomplete presenter video");
      await phase("Preparing captions and your private MP4");
      await exec(ffmpeg, presenterRenderArgs(brief, seconds), { cwd: work, timeout: 240_000, signal, maxBuffer: 256 * 1024 });
      const final = await probe("presenter.mp4");
      if (Math.abs(Number(final.format.duration) - seconds) > .25 || !final.streams.some(s => s.codec_type === "audio")) throw new Error("Presenter export validation failed");
      await artifacts.saveFile("presenter.mp4", path.join(work, "presenter.mp4"), "video/mp4", MEDIA_LIMITS.video);
      const output = { seconds }; await save("result.json", output); return output;
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
