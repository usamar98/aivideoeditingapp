import type { AdRemakeBrief } from "../src/lib/ad-remake/schema";

export function adRemakeRenderArgs(b: AdRemakeBrief, seconds: number, width: number, height: number, hasAudio: boolean) {
  const filters = [`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, "setsar=1",
    "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='AI-edited ad':fontsize=18:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8:x=18:y=18"];
  if (b.cta) {
    const lines = wrapRemakeCta(b.cta).split("\n").length, fontSize = Math.min(width < 800 ? 24 : 32, Math.floor((width - 40) / 28));
    const banner = Math.max(100, lines * fontSize + (lines - 1) * 4 + 32);
    filters.push(`drawbox=x=0:y=ih-${banner}:w=iw:h=${banner}:color=${b.brandColor.replace("#", "0x")}@0.9:t=fill:enable='gte(t,${Math.max(0, seconds - 2)})'`,
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=cta.txt:expansion=none:fontsize=${fontSize}:line_spacing=4:fontcolor=white:x=(w-text_w)/2:y=h-${banner}/2-text_h/2:enable='gte(t,${Math.max(0, seconds - 2)})'`);
  }
  return ["-y", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", "edited.mp4",
    ...(b.keepAudio && hasAudio ? ["-protocol_whitelist", "file,pipe", "-i", "source.mp4"] : []),
    "-map", "0:v:0", ...(b.keepAudio && hasAudio ? ["-map", "1:a:0", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-vf", filters.join(","), "-map_metadata", "-1", "-t", String(seconds), "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "remake.mp4"];
}
export function wrapRemakeCta(text: string) {
  const lines: string[] = []; let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const chunks = word.match(/.{1,28}/gu) || [];
    for (const chunk of chunks) {
      if (line && Array.from(`${line} ${chunk}`).length > 28) { lines.push(line); line = ""; }
      line = line ? `${line} ${chunk}` : chunk;
    }
  }
  if (line) lines.push(line); return lines.join("\n");
}
