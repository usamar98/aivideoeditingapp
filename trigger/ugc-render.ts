import type { UgcBrief } from "../src/lib/ugc/schema";

export function ugcRenderArgs(brief: UgcBrief, imageCount: number) {
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > 4) throw new Error("Invalid product photo count");
  if (!/^#[0-9a-fA-F]{6}$/.test(brief.brandColor)) throw new Error("Invalid brand color");
  const vertical = brief.aspectRatio === "9:16";
  const [width, height] = vertical ? [720, 1280] : brief.aspectRatio === "1:1" ? [720, 720] : [1280, 720];
  const pw = vertical ? 720 : width / 2, ph = vertical ? 440 : height;
  const aw = vertical ? 720 : width / 2, ah = vertical ? 840 : height;
  const filter = [
    `[0:v]scale=${aw}:${ah}:force_original_aspect_ratio=increase,crop=${aw}:${ah},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${brief.duration}[actor]`,
    ...Array.from({ length: imageCount }, (_, i) => `[${i + 2}:v]scale=${pw - 48}:${ph - 120}:force_original_aspect_ratio=decrease,pad=${pw}:${ph}:(ow-iw)/2:(oh-ih)/2:color=0xFAF7EF,setsar=1,fps=30[p${i}]`),
  ];
  let last = "p0";
  for (let i = 1; i < imageCount; i++) {
    filter.push(`[${last}][p${i}]overlay=0:0:enable='gte(t,${(brief.duration * i / imageCount).toFixed(2)})'[products${i}]`);
    last = `products${i}`;
  }
  filter.push(`[actor][${last}]${vertical ? "vstack" : "hstack"}=inputs=2[layout]`);
  const border = `drawbox=x=${vertical ? 0 : aw}:y=${vertical ? ah : 0}:w=${vertical ? width : 6}:h=${vertical ? 6 : height}:color=${brief.brandColor.replace("#", "0x")}:t=fill`;
  const disclosure = "drawtext=font='DejaVu Sans':text='AI presenter':expansion=none:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=24:y=24";
  const cta = `drawtext=font='DejaVu Sans':textfile=cta.txt:expansion=none:fontsize=${vertical ? 26 : 23}:fontcolor=0x182D4E:line_spacing=6:x=${vertical ? "(w-text_w)/2" : `${aw}+(w/2-text_w)/2`}:y=h-text_h-26`;
  const captions = brief.captions ? `,subtitles=captions.srt:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00302010,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=${vertical ? 465 : 100}'` : "";
  filter.push(`[layout]${border},${disclosure},${cta}${captions}[out]`);
  return ["-y", "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_complex_threads", "1", "-filter_threads", "1",
    "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", "avatar.mp4", "-i", "voice.mp3",
    ...Array.from({ length: imageCount }, (_, i) => ["-loop", "1", "-framerate", "30", "-i", `product-${i}.png`]).flat(),
    "-filter_complex", filter.join(";"), "-map", "[out]", "-map", "1:a:0", "-af", "apad", "-t", String(brief.duration),
    "-c:v", "libx264", "-threads:v", "2", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads:a", "1", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "ad.mp4"];
}
export function wrapAdCta(text: string) {
  const words = text.replace(/[\r\n\u0000-\u001f]/g, " ").trim().split(/\s+/).flatMap((word) => word.match(/.{1,26}/gu) || []); const lines: string[] = [""];
  for (const word of words) {
    if (lines[lines.length - 1] && lines[lines.length - 1].length + 1 + word.length > 26) lines.push("");
    lines[lines.length - 1] += `${lines[lines.length - 1] ? " " : ""}${word}`;
  }
  return lines.join("\n");
}
