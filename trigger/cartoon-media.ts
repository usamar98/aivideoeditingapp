import { MEDIA_LIMITS, streamToFile } from "./media-io";

export function isCartoonMediaUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fal.media" || url.hostname.endsWith(".fal.media") ||
        (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/falserverless/")));
  } catch { return false; }
}
export async function downloadCartoonVideo(raw: string, destination: string, signal: AbortSignal) {
  if (!isCartoonMediaUrl(raw)) throw new Error("Unexpected provider video host");
  const transferSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const response = await fetch(raw, { redirect: "error", signal: transferSignal });
  if (!response.ok || !response.body || !/^(video\/|application\/octet-stream)/.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel(); throw new Error("Video download failed");
  }
  await streamToFile(response.body, destination, MEDIA_LIMITS.video, transferSignal);
}
export function cartoonClipArgs(index: number, seconds: number, vertical: boolean) {
  const [w, h] = vertical ? [720, 1280] : [1280, 720];
  return ["-y", "-hide_banner", "-loglevel", "error", "-threads", "2", "-filter_threads", "1", "-i", `raw-${index}.mp4`,
    "-map", "0:v:0", "-map", "0:a:0", "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=1`,
    "-af", "apad", "-t", String(seconds), "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-movflags", "+faststart", `clip-${index}.mp4`];
}
