// Optional local encoder test; synthetic charts only, no network or paid inference.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, copyFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { remakeBrief } from "./fixtures/ad-remake";
import { adRemakeRenderArgs, wrapRemakeCta } from "../trigger/ad-remake-render";
const exec = promisify(execFile), binary = process.env.AD_REMAKE_FFMPEG_TEST;
it.skipIf(!binary)("encodes both ad orientations, exact CTA, silent and original-audio exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eta-ad-remake-encoder-test-"));
  const run = (args: string[]) => exec(binary!, args, { cwd: dir, timeout: 120000, maxBuffer: 1024 * 1024 });
  try {
    if (process.platform === "win32") await copyFile("C:/Windows/Fonts/arial.ttf", path.join(dir, "font.ttf"));
    await writeFile(path.join(dir, "cta.txt"), wrapRemakeCta("It's yours: 100% original"));
    for (const [width, height] of [[720,1280],[1280,720]]) {
      await run(["-y","-v","error","-f","lavfi","-i",`color=c=beige:s=${width}x${height}:r=30`,"-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","5","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","source.mp4"]);
      await copyFile(path.join(dir, "source.mp4"), path.join(dir, "edited.mp4"));
      for (const keepAudio of [false,true]) {
        const args = adRemakeRenderArgs({ ...remakeBrief, keepAudio }, 5, width, height, true).map(v => process.platform === "win32" ? v.replaceAll("fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "fontfile=font.ttf") : v);
        await run(args); expect((await stat(path.join(dir, "remake.mp4"))).size).toBeGreaterThan(10000);
        const decoded = await run(["-hide_banner","-i","remake.mp4","-f","null","-"]);
        expect(decoded.stderr).toContain(`${width}x${height}`); expect(decoded.stderr).toMatch(/Duration: 00:00:05/);
        expect(decoded.stderr.includes("Audio: aac")).toBe(keepAudio);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
},180000);
