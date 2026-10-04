import type { EstateBrief } from "../src/lib/real-estate/schema";

export function wrapEstateText(text: string, columns = 34) {
  const words = text.replace(/[\r\n\u0000-\u001f]/g, " ").trim().split(/\s+/).flatMap(w => w.match(new RegExp(`.{1,${columns}}`, "gu")) || []);
  const lines = [""];
  for (const word of words) { if (lines.at(-1)!.length + word.length + 1 > columns) lines.push(""); lines[lines.length - 1] += `${lines.at(-1) ? " " : ""}${word}`; }
  return lines.join("\n");
}
const base = ["-y", "-nostdin", "-v", "error", "-filter_threads", "1", "-threads", "1", "-protocol_whitelist", "file,pipe"];
const encode = ["-c:v", "libx264", "-threads:v", "2", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-map_metadata", "-1", "-movflags", "+faststart"];
export function estateClipArgs(b: EstateBrief, i: number, narrated: boolean, outro = false) {
  const [w, h] = b.aspectRatio === "9:16" ? [1080, 1920] : [1920, 1080], seconds = outro ? 4 : b.secondsPerRoom;
  const source = outro ? `color=c=${b.brandColor.replace("#", "0x")}:s=${w}x${h}:r=24` : b.model === "photo-motion" ? `photo-${i}.png` : `raw-${i}.mp4`;
  const input = outro ? ["-f", "lavfi", "-i", source] : b.model === "photo-motion" ? ["-loop", "1", "-framerate", "24", "-i", source] : ["-i", source];
  const filters = [`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x101c22`, "setsar=1", "fps=24"];
  // Deterministic photo motion uses a slightly inset canvas, so the whole original remains visible.
  if (!outro && b.model === "photo-motion" && b.rooms[i].motion !== "still") {
    filters.splice(0, filters.length, `scale=${Math.floor(w * .9)}:${Math.floor(h * .9)}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x101c22`, "setsar=1",
      `zoompan=z='${b.rooms[i].motion === "push" ? `1+0.04*on/${seconds * 24}` : "1.03"}':x='${b.rooms[i].motion === "pan" ? `(iw-iw/zoom)*on/${seconds * 24}` : "(iw-iw/zoom)/2"}':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=24`);
  }
  const draw = (file: string, size: number, y: string) => `drawtext=font='DejaVu Sans':textfile=${file}:expansion=none:fontsize=${size}:fontcolor=white:line_spacing=10:x=60:y=${y}`;
  if (outro) filters.push(draw("outro.txt", b.aspectRatio === "9:16" ? 42 : 44, "(h-text_h)/2"));
  else filters.push("drawbox=x=0:y=h-210:w=iw:h=210:color=black@0.65:t=fill", draw(`label-${i}.txt`, 36, "h-174"), draw("brand.txt", 24, "h-62"));
  if (b.model !== "photo-motion") filters.push("drawtext=font='DejaVu Sans':text='AI-animated - verify property details':expansion=none:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10:x=40:y=40");
  const audio = narrated && !outro ? ["-i", `voice-${i}.mp3`] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  return [...base, ...input, ...audio, "-vf", filters.join(","), "-map", "0:v:0", "-map", "1:a:0", "-af", "apad", "-t", String(seconds), ...encode, outro ? "outro.mp4" : `clip-${i}.mp4`];
}
export function estateJoinArgs() { return [...base, "-f", "concat", "-safe", "1", "-i", "clips.txt", "-c", "copy", "-movflags", "+faststart", "listing.mp4"]; }
export function estateCaptions(b: EstateBrief) {
  const stamp = (n: number) => `00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")},000`;
  return b.rooms.map((r, i) => `${i + 1}\n${stamp(i * b.secondsPerRoom)} --> ${stamp((i + 1) * b.secondsPerRoom)}\n${r.narration || r.label}\n`).join("\n");
}
