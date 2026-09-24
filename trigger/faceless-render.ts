export const FACELESS_MACHINE = "medium-2x" as const;

// Explicit thread limits avoid sizing pools from the host's CPU count.
export function sceneRenderArgs(index: number, duration: number, filter: string) {
  return [
    "-y", "-nostdin", "-hide_banner", "-loglevel", "error", "-nostats",
    "-filter_threads", "1", "-filter_complex_threads", "1",
    "-threads", "1", "-loop", "1", "-framerate", "30", "-i", `image-${index}.jpg`,
    "-threads", "1", "-i", `voice-${index}.mp3`,
    "-t", String(duration), "-vf", filter, "-r", "30",
    "-c:v", "libx264", "-threads:v", "2", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-threads:a", "1", "-ar", "48000", "-ac", "2", "-b:a", "128k",
    "-shortest", `clip-${index}.mp4`,
  ];
}

export function concatRenderArgs() {
  return [
    "-y", "-nostdin", "-hide_banner", "-loglevel", "error", "-nostats",
    "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", "video.mp4",
  ];
}

export function sceneFilter(width: number, height: number, index: number, captions: boolean) {
  const resize = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  return captions
    ? `${resize},subtitles=captions-${index}.srt:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00302010,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=40'`
    : resize;
}
