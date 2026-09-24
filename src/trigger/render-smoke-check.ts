import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { task } from "@trigger.dev/sdk";
import { FACELESS_MACHINE, concatRenderArgs, sceneFilter, sceneRenderArgs } from "../../trigger/faceless-render";

const exec = promisify(execFile);

// Synthetic media only: no provider requests, database writes, or app credits.
export const renderSmokeCheck = task({
  id: "render-smoke-check",
  machine: FACELESS_MACHINE,
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (_payload: Record<string, never>, { signal, ctx }) => {
    const work = await mkdtemp(path.join(tmpdir(), "render-smoke-"));
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const options = { cwd: work, signal, timeout: 30_000, maxBuffer: 256 * 1024 };
    try {
      await exec(ffmpeg, [
        "-y", "-nostdin", "-loglevel", "error", "-filter_threads", "1",
        "-f", "lavfi", "-i", "color=c=blue:s=1280x720", "-frames:v", "1", "-threads:v", "1", "image-0.jpg",
      ], options);
      await exec(ffmpeg, [
        "-y", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-t", "2", "-threads:a", "1", "voice-0.mp3",
      ], options);
      await writeFile(path.join(work, "captions-0.srt"), "1\n00:00:00,000 --> 00:00:02,000\nRender verification\n");
      const outputs = [];
      for (const [width, height] of [[720, 1280], [1280, 720]]) {
        await exec(ffmpeg, sceneRenderArgs(0, 2, sceneFilter(width, height, 0, true)), options);
        await writeFile(path.join(work, "concat.txt"), "file 'clip-0.mp4'\nfile 'clip-0.mp4'");
        await exec(ffmpeg, concatRenderArgs(), options);
        const { stdout } = await exec(ffprobe, [
          "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", "video.mp4",
        ], options);
        const probe = JSON.parse(stdout) as {
          streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
          format: { duration: string };
        };
        const video = probe.streams.find((stream) => stream.codec_type === "video");
        const audio = probe.streams.find((stream) => stream.codec_type === "audio");
        const duration = Number(probe.format.duration);
        if (video?.width !== width || video.height !== height || video.codec_name !== "h264"
          || audio?.codec_name !== "aac" || !Number.isFinite(duration) || duration < 3.8 || duration > 4.5) {
          throw new Error("Synthetic render verification failed");
        }
        outputs.push({ width, height, duration, video: video.codec_name, audio: audio.codec_name });
      }
      return { ok: true, node: process.versions.node, machine: ctx.machine, outputs };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  },
});
