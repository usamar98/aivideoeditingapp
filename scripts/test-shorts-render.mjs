// Offline integration test. No API keys, real recordings or provider charges.
// node --experimental-strip-types scripts/test-shorts-render.mjs <ffmpeg> <ffprobe> [python]
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { shortsCaptions, shortsRenderArgs, framingCommands } from "../trigger/shorts-media.ts";

const [ffmpeg, ffprobe, python = "python3"] = process.argv.slice(2);
if (!ffmpeg || !ffprobe) throw new Error("Pass installed FFmpeg and FFprobe paths; Python needs OpenCV.");
const work = await mkdtemp(join(tmpdir(), "eta-shorts-render-test-")), exec = promisify(execFile);
const run = (binary, args) => exec(binary, args, { cwd: work, timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
try {
  if (process.platform === "win32") {
    await writeFile(join(work, "fonts.conf"), '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>C:/Windows/Fonts</dir><cachedir>fontcache</cachedir></fontconfig>');
    process.env.FONTCONFIG_FILE = join(work, "fonts.conf");
  }
  // An existing AI-generated public illustration and synthetic tone, not a user video.
  await run(ffmpeg, ["-y", "-v", "error", "-loop", "1", "-i", resolve("public/examples/presenter-product.webp"), "-f", "lavfi", "-i", "sine=frequency=440:duration=15", "-vf", "scale=-2:720,pad=1280:720:(ow-iw)/2:0:color=0x10294d", "-t", "15", "-r", "30", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "clip.mp4"]);
  const samples = JSON.parse((await run(python, [resolve("trigger/shorts-faces.py"), join(work, "clip.mp4")])).stdout);
  assert.ok(samples.length >= 74 && samples.length <= 76);
  assert.ok(samples.every((s) => s.t >= 0 && s.t <= 15 && s.faces.every((f) => f.x >= 0 && f.x <= 1)));
  const words = "Offline caption test. Review each useful moment before publishing your video.".split(" ").map((text, i) => ({ text, start: i, end: i + .8, speaker: "A" }));
  const analysis = { duration: 15, width: 1280, height: 720, words };
  const clip = { id: "clip-1", title: "Render test", reason: "Offline integration test", start: 0, end: 15, center: .5, framing: "follow", captions: "highlight" };
  const plan = { clips: [clip], captionEdits: {}, speakerPositions: { A: .5 } };
  const captions = shortsCaptions(words, clip), track = framingCommands(samples, clip, analysis, plan);
  assert.ok(track.found > 0, "The known front-facing fixture should be detected at least once");
  await writeFile(join(work, "captions.ass"), captions.ass); await writeFile(join(work, "captions.srt"), captions.srt);
  await writeFile(join(work, "framing.txt"), track.commands);
  console.log(`PASS OpenCV: ${track.found}/${track.total} sampled frames matched the anchor`);
  for (const [framing, style] of [["follow", "highlight"], ["manual", "clean"], ["fit", "none"]]) {
    const options = { ...clip, framing, captions: style };
    await writeFile(join(work, "captions.ass"), shortsCaptions(words, options).ass);
    await run(ffmpeg, shortsRenderArgs(options));
    const data = JSON.parse((await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", "short.mp4"])).stdout);
    const video = data.streams.find((s) => s.codec_type === "video"), audio = data.streams.find((s) => s.codec_type === "audio");
    assert.equal(video.width, 720); assert.equal(video.height, 1280); assert.equal(video.pix_fmt, "yuv420p");
    assert.equal(video.codec_name, "h264"); assert.equal(audio.codec_name, "aac"); assert.ok(Math.abs(Number(data.format.duration) - 15) < .15);
    if (process.env.SHORTS_KEEP_TEST_OUTPUT === "1") await run(ffmpeg, ["-y", "-v", "error", "-ss", "2.3", "-i", "short.mp4", "-frames:v", "1", `${framing}-preview.png`]);
    console.log(`PASS ${framing}/${style}: 720x1280 H.264/AAC, 15 seconds`);
  }
  if (process.env.SHORTS_KEEP_TEST_OUTPUT === "1") console.log(`Offline fixtures: ${work}`);
} finally {
  // This is only the script's freshly created temporary directory.
  if (process.env.SHORTS_KEEP_TEST_OUTPUT !== "1") await rm(work, { recursive: true, force: true });
}
