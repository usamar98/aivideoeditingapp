import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { task } from "@trigger.dev/sdk";
import { presenterRenderArgs } from "../../trigger/presenter-render";

const exec = promisify(execFile);
// Synthetic media only: checks the deployed renderer without portraits, provider
// requests, database writes, or app-credit deductions. Never returns secret values.
export const presenterSmokeCheck = task({
  id: "presenter-smoke-check", machine: "medium-2x", maxDuration: 180, retry: { maxAttempts: 1 },
  run: async (_payload: Record<string, never>, { signal }) => {
    const required = ["FAL_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_DEFAULT_VOICE_ID", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length) throw new Error(`Worker configuration missing: ${missing.join(", ")}`);
    const work = await mkdtemp(path.join(tmpdir(), "presenter-smoke-"));
    const options = { cwd: work, signal, timeout: 60_000, maxBuffer: 256 * 1024 };
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    try {
      await exec(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x640:r=25", "-t", "2", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "avatar.mp4"], options);
      await exec(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "voice.mp3"], options);
      await writeFile(path.join(work, "captions.srt"), "1\n00:00:00,000 --> 00:00:02,000\nSynthetic renderer verification\n");
      const outputs = [];
      for (const [resolution, aspectRatio, width, height] of [["480p", "9:16", 480, 854], ["720p", "16:9", 1280, 720]] as const) {
        await exec(ffmpeg, presenterRenderArgs({ title: "Smoke test", script: "Synthetic verification", model: "fabric-1.0", captions: true, duration: 15, resolution, aspectRatio }, 2), options);
        const { stdout } = await exec(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", "presenter.mp4"], options);
        const data = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]; format: { duration: string } };
        const video = data.streams.find(s => s.codec_type === "video"), audio = data.streams.find(s => s.codec_type === "audio"), duration = Number(data.format.duration);
        if (video?.width !== width || video.height !== height || video.codec_name !== "h264" || audio?.codec_name !== "aac" || !Number.isFinite(duration) || Math.abs(duration - 2) > .25) throw new Error("Presenter render smoke check failed");
        outputs.push({ resolution, aspectRatio, width, height, duration });
      }
      return { ok: true, configurationPresent: true, paidProviderCalls: 0, outputs };
    } finally { await rm(work, { recursive: true, force: true }); }
  },
});
