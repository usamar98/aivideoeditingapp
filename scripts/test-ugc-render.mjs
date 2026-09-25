// Offline, no-provider smoke test of the real UGC FFmpeg composition.
// node --experimental-strip-types scripts/test-ugc-render.mjs /path/to/ffmpeg /path/to/ffprobe
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { ugcRenderArgs, wrapAdCta } from "../trigger/ugc-render.ts";

const [ffmpeg, ffprobe] = process.argv.slice(2);
if (!ffmpeg || !ffprobe) throw new Error("Pass installed FFmpeg and FFprobe executable paths.");
const dir = await mkdtemp(join(tmpdir(), "eta-ugc-render-test-"));
const exec = promisify(execFile);
const run = (bin, args) => exec(bin, args, { cwd: dir, timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
const media = (...args) => run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
try {
  // Installations without a system Fontconfig config need a test-only Windows config.
  if (process.platform === "win32") {
    await writeFile(join(dir, "fonts.conf"), '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>C:/Windows/Fonts</dir><cachedir>fontcache</cachedir></fontconfig>');
    process.env.FONTCONFIG_FILE = join(dir, "fonts.conf");
  }
  await media("-f", "lavfi", "-i", "color=c=0x3458ac:s=720x960:r=30:d=2", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "avatar.mp4");
  await media("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame", "voice.mp3");
  for (let i = 0; i < 4; i++) await media("-f", "lavfi", "-i", `color=c=${["red", "green", "yellow", "white"][i]}:s=400x400`, "-frames:v", "1", `product-${i}.png`);
  await writeFile(join(dir, "cta.txt"), wrapAdCta("Explore the collection today"));
  await writeFile(join(dir, "captions.srt"), "1\n00:00:00,000 --> 00:00:02,000\nSynthetic render test\n\n");
  for (const [aspectRatio, width, height] of [["9:16", 720, 1280], ["1:1", 720, 720], ["16:9", 1280, 720]]) {
    const brief = { aspectRatio, duration: 15, captions: true, brandColor: "#2455ED" };
    await run(ffmpeg, ugcRenderArgs(brief, 4));
    const { stdout } = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", "ad.mp4"]);
    const data = JSON.parse(stdout), video = data.streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.width, width); assert.equal(video.height, height);
    assert.ok(data.streams.some((stream) => stream.codec_type === "audio"));
    assert.ok(Math.abs(Number(data.format.duration) - 15) < 0.1);
    assert.equal(video.pix_fmt, "yuv420p");
    console.log(`PASS ${aspectRatio}: ${width}x${height}, 15s, H.264/AAC, four product images + captions + CTA + disclosure`);
  }
} finally {
  // Only this script's freshly created test directory is removed.
  await rm(dir, { recursive: true, force: true });
}
