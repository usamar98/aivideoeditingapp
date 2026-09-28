import type { PresenterBrief } from "../src/lib/presenter/schema";

// libass is included in the deployed FFmpeg build; drawtext is not. Keep the
// disclosure independent of the optional script captions and visible throughout.
export const PRESENTER_DISCLOSURE_SRT = "1\n00:00:00,000 --> 00:00:30,000\nAI presenter\n";

export function presenterRenderArgs(brief: PresenterBrief, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > brief.duration) throw new Error("Invalid voice duration");
  const short = brief.resolution === "480p" ? 480 : 720;
  const long = brief.resolution === "480p" ? 854 : 1280;
  const [w, h] = brief.aspectRatio === "9:16" ? [short, long] : [long, short];
  const filters = [`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x101e36`, "setsar=1"];
  if (brief.captions) filters.push("subtitles=captions.srt:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00102030,BorderStyle=1,Outline=2,MarginV=35'");
  filters.push("subtitles=disclosure.srt:force_style='FontName=DejaVu Sans,FontSize=12,PrimaryColour=&H00FFFFFF,OutlineColour=&H80102030,BorderStyle=3,Outline=2,Shadow=0,Alignment=7,MarginL=12,MarginV=12'");
  return ["-y", "-v", "error", "-threads", "2", "-protocol_whitelist", "file,pipe", "-i", "avatar.mp4", "-i", "voice.mp3", "-map", "0:v:0", "-map", "1:a:0", "-vf", filters.join(","), "-t", seconds.toFixed(3), "-r", "25", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "presenter.mp4"];
}
