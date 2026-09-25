import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { schemaTask, metadata, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shortsBriefSchema, shortsAnalysisSchema, shortsPlanSchema, shortsOutputSchema, shortsSelectionSchema, validateShortsPlan, SHORTS_MAX_BYTES, SHORTS_MAX_SECONDS, SHORTS_TRANSCRIPTION_MODEL } from "../src/lib/shorts/schema";
import { claimJob, assertJobActive, finishCancelledJob } from "./job-control";
import { artifactStore, MEDIA_LIMITS } from "./media-io";
import { cartoonFalClient, runFalStage, CARTOON_PLANNER_ENDPOINT, CARTOON_PLANNER_MODEL } from "./cartoon-fal";
import { parseShortsTranscript, shortsPlannerRequest, parseShortsPlan } from "./shorts-planner";
import { shortsCaptions, shortsRenderArgs, framingCommands } from "./shorts-media";

const exec = promisify(execFile), MAX_JSON = 8 * 1024 * 1024;
const resultSchema = z.object({ analysis: shortsAnalysisSchema.nullable(), plan: shortsPlanSchema.nullable(), outputs: shortsOutputSchema.nullable() });
function database() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Worker database credentials are missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const shortsPipeline = schemaTask({
  id: "shorts-pipeline", schema: z.object({ generationId: z.string().uuid() }), machine: "medium-2x", maxDuration: 5400,
  queue: { concurrencyLimit: 2 }, retry: { maxAttempts: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 10000 },
  onCancel: async ({ payload, runPromise }) => { await finishCancelledJob(database(), payload.generationId, runPromise); },
  onComplete: async ({ payload, result }) => {
    const output = result.ok ? resultSchema.parse(result.data) : null;
    const settled = await database().rpc("finish_shorts_job", { job_id: payload.generationId, succeeded: result.ok, result_analysis: output?.analysis ?? null, result_plan: output?.plan ?? null, result_outputs: output?.outputs ?? null });
    if (settled.error) throw new Error("Shorts credit settlement failed. Contact support with the job ID.");
  },
  run: async ({ generationId }, { signal, ctx }) => {
    const db = database(); await claimJob(db, generationId, ctx.run.id, ctx.attempt.number);
    const checkpoint = () => assertJobActive(db, generationId, signal);
    const { data: job, error } = await db.from("generations").select("*").eq("id", generationId).single();
    if (error || !job || !["shorts-analyze", "shorts-render"].includes(job.operation)) throw new Error("Shorts job not found");
    const settings = z.object({ projectId: z.string().uuid(), kind: z.enum(["analyze", "render"]), brief: shortsBriefSchema, plan: shortsPlanSchema.nullable(), clipIds: z.array(z.string()) }).parse(job.settings);
    const { brief } = settings, bucket = db.storage.from("private-media"), ownerPrefix = `${job.workspace_id}/${job.requested_by}/`, prefix = `${ownerPrefix}shorts/${generationId}`;
    const artifacts = artifactStore(bucket, prefix, signal, checkpoint);
    const load = (name: string) => artifacts.load(name, MAX_JSON);
    const save = async (name: string, value: unknown) => {
      await checkpoint(); const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MAX_JSON) throw new Error("Shorts checkpoint is too large");
      if ((await bucket.upload(`${prefix}/${name}`, body, { contentType: "application/json", upsert: true })).error) throw new Error("Could not persist Shorts checkpoint");
    };
    const phase = async (label: string) => {
      await checkpoint(); metadata.set("phase", label);
      if ((await db.from("generations").update({ settings: { ...job.settings, phase: label, artifactPrefix: prefix } }).eq("id", generationId)).error) throw new Error("Could not update Shorts progress");
    };
    const cached = await load("result.json"); if (cached) return resultSchema.parse(JSON.parse(cached.toString()));
    const work = await mkdtemp(path.join(tmpdir(), "eta-shorts-"));
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const run = (args: string[], timeout = 240_000) => exec(ffmpeg, args, { cwd: work, timeout, signal, maxBuffer: 256 * 1024 });
    const probe = async (name: string, container = "mov") => {
      const result = await exec(ffprobe, ["-v", "error", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-f", container, "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", name], { cwd: work, timeout: 30_000, signal, maxBuffer: 256 * 1024 });
      return z.object({ format: z.object({ duration: z.coerce.number().finite() }), streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })) }).parse(JSON.parse(result.stdout));
    };
    try {
      await phase("Checking and downloading your private source video");
      const { data: asset } = await db.from("assets").select("storage_path,byte_size,mime_type").eq("id", brief.sourceAssetId).eq("workspace_id", job.workspace_id).eq("owner_id", job.requested_by).eq("kind", "video").is("deleted_at", null).maybeSingle();
      if (!asset || !asset.storage_path.startsWith(`${ownerPrefix}shorts-inputs/`) || asset.storage_path.includes("..") || asset.byte_size > SHORTS_MAX_BYTES || !["video/mp4", "video/quicktime", "video/webm"].includes(asset.mime_type)) throw new Error("Invalid source video ownership or size");
      const inputs = artifactStore(bucket, `${ownerPrefix}shorts-inputs`, signal, checkpoint);
      if (!await inputs.loadFile(asset.storage_path.split("/").pop()!, path.join(work, "source"), SHORTS_MAX_BYTES)) throw new Error("Source upload did not finish");
      // Never autodetect uploaded playlists, manifests, or other file-reading
      // demuxers. Only the declared media container is allowed, offline.
      const container = asset.mime_type === "video/webm" ? "matroska" : "mov";
      const info = await probe("source", container), video = info.streams.find((s) => s.codec_type === "video"), duration = info.format.duration;
      if (duration < 30 || duration > SHORTS_MAX_SECONDS || !video?.width || !video.height || video.width * video.height > 1920 * 1080 || Math.max(video.width, video.height) > 1920 || !info.streams.some((s) => s.codec_type === "audio")) throw new Error("Upload a 30-second to 30-minute video with speech, up to 1080p and 200 MB");
      if (settings.kind === "analyze") {
        const client = cartoonFalClient();
        const provider = (name: string, endpoint: string, input: Record<string, unknown>) => runFalStage({ name, endpoint, input, model: endpoint === CARTOON_PLANNER_ENDPOINT ? CARTOON_PLANNER_MODEL : undefined, client, store: { load, save }, signal, checkpoint, pause: () => wait.for({ seconds: 10 }) });
        await phase("Transcribing speech and identifying voices");
        await run(["-y", "-nostdin", "-v", "error", "-threads", "1", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-f", container, "-i", "source", "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", "audio.mp3"]);
        await artifacts.saveFile("audio.mp3", path.join(work, "audio.mp3"), "audio/mpeg", 32 * 1024 * 1024);
        const signed = await bucket.createSignedUrl(`${prefix}/audio.mp3`, 7200);
        if (signed.error || !signed.data) throw new Error("Could not prepare private transcription input");
        const transcript = await provider("transcript", SHORTS_TRANSCRIPTION_MODEL, { audio_url: signed.data.signedUrl, task: "transcribe", chunk_level: "word", diarize: true, ...(brief.language === "auto" ? {} : { language: brief.language }) });
        const analysis = shortsAnalysisSchema.parse({ duration, width: video.width, height: video.height, words: parseShortsTranscript(transcript, duration) });
        await phase("Finding self-contained highlights for review");
        const plan = parseShortsPlan(await provider("highlights", CARTOON_PLANNER_ENDPOINT, shortsPlannerRequest(brief, analysis)), analysis, brief.clipCount);
        const output = { analysis, plan, outputs: null }; await save("result.json", output); return output;
      }
      const stored = await db.from("shorts_projects").select("analysis").eq("id", settings.projectId).eq("user_id", job.requested_by).eq("generation_id", generationId).single();
      if (stored.error) throw new Error("Saved analysis unavailable");
      const analysis = shortsAnalysisSchema.parse(stored.data.analysis), plan = shortsPlanSchema.parse(settings.plan), ids = shortsSelectionSchema.parse(settings.clipIds);
      validateShortsPlan(plan, analysis);
      const outputs: z.infer<typeof shortsOutputSchema> = {};
      for (const [index, id] of ids.entries()) {
        const clip = plan.clips.find((c) => c.id === id); if (!clip) throw new Error("Selected clip is missing");
        const completed = await load(`${id}-complete.json`);
        if (completed) { Object.assign(outputs, shortsOutputSchema.parse(JSON.parse(completed.toString()))); continue; }
        await phase(`Clip ${index + 1}/${ids.length}: cutting original footage`);
        await run(["-y", "-nostdin", "-v", "error", "-threads", "1", "-max_alloc", "67108864", "-ss", String(clip.start), "-protocol_whitelist", "file,pipe", "-f", container, "-i", "source", "-t", String(clip.end - clip.start), "-map", "0:v:0", "-map", "0:a:0", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1", "-c:v", "libx264", "-threads:v", "2", "-preset", "fast", "-crf", "18", "-r", "30", "-c:a", "aac", "clip.mp4"]);
        const captions = shortsCaptions(analysis.words.map((word, i) => ({ ...word, text: plan.captionEdits[String(i)] ?? word.text })), clip);
        await writeFile(path.join(work, "captions.ass"), captions.ass); await writeFile(path.join(work, "captions.srt"), captions.srt);
        let framingNote = clip.framing === "fit" ? "Full source frame retained with blurred background." : "Manual crop; check the speaker remains visible.";
        if (clip.framing === "follow") {
          await phase(`Clip ${index + 1}/${ids.length}: following faces near your speaker positions`);
          const detected = await exec(process.env.PYTHON_PATH || "python3", [path.join(process.cwd(), "trigger", "shorts-faces.py"), path.join(work, "clip.mp4")], { cwd: work, signal, timeout: 180_000, maxBuffer: 1024 * 1024 });
          const samples = z.array(z.object({ t: z.number().min(0).max(60), faces: z.array(z.object({ x: z.number().min(0).max(1), size: z.number().min(0).max(1) })).max(10) })).max(301).parse(JSON.parse(detected.stdout));
          const actual = (await probe("clip.mp4")).streams.find((s) => s.codec_type === "video")!;
          const track = framingCommands(samples.length ? samples : [{ t: 0, faces: [] }], clip, { ...analysis, width: actual.width!, height: actual.height! }, plan);
          await writeFile(path.join(work, "framing.txt"), track.commands);
          framingNote = `Face matched in ${track.total ? Math.round(track.found / track.total * 100) : 0}% of sampled frames. Uncertain frames use your anchor position. Review every speaker change.`;
        }
        await phase(`Clip ${index + 1}/${ids.length}: rendering vertical video and captions`);
        await run(shortsRenderArgs(clip));
        const rendered = await probe("short.mp4"), stream = rendered.streams.find((s) => s.codec_type === "video");
        if (Math.abs(rendered.format.duration - (clip.end - clip.start)) > .4 || stream?.width !== 720 || stream.height !== 1280 || !rendered.streams.some((s) => s.codec_type === "audio")) throw new Error("Shorts export validation failed");
        await artifacts.saveFile(`${id}.mp4`, path.join(work, "short.mp4"), "video/mp4", MEDIA_LIMITS.video);
        await artifacts.saveFile(`${id}.srt`, path.join(work, "captions.srt"), "application/x-subrip", MEDIA_LIMITS.json);
        outputs[id] = { videoPath: `${prefix}/${id}.mp4`, captionsPath: `${prefix}/${id}.srt`, title: clip.title, start: clip.start, end: clip.end, framingNote, createdAt: new Date().toISOString() };
        await save(`${id}-complete.json`, { [id]: outputs[id] });
      }
      const output = { analysis: null, plan: null, outputs }; await save("result.json", output); return output;
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
