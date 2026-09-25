import type { ShortsAnalysis, ShortsClip, ShortsPlan, ShortsWord } from "../src/lib/shorts/schema";

export function clipWords(words: ShortsWord[], clip: Pick<ShortsClip, "start" | "end">) {
  return words.filter((w) => w.start < clip.end && w.end > clip.start).map((w) => ({ ...w, start: Math.max(0, w.start - clip.start), end: Math.min(clip.end - clip.start, w.end - clip.start) }));
}
function stamp(seconds: number, ass = false) {
  const ticks = Math.round(seconds * (ass ? 100 : 1000));
  const scale = ass ? 100 : 1000, s = Math.floor(ticks / scale);
  return `${ass ? Math.floor(s / 3600) : String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}${ass ? "." : ","}${String(ticks % scale).padStart(ass ? 2 : 3, "0")}`;
}
export function safeCaption(text: string) { return text.replace(/[\\{}<>\r\n]/g, " ").replace(/\s+/g, " ").trim(); }
export function shortsCaptions(words: ShortsWord[], clip: ShortsClip) {
  // Overlapping voices may share timestamps. Avoid zero/negative duration
  // highlight events and overlapping caption blocks in that case.
  const local = clipWords(words, clip).sort((a, b) => a.start - b.start), groups: ShortsWord[][] = [];
  for (const w of local) {
    const group = groups.at(-1);
    if (!group || group.length >= 5 || w.start - group.at(-1)!.end > .6 || group.map((item) => item.text).join(" ").length > 32) groups.push([w]);
    else group.push(w);
  }
  const blocks = groups.map((g, i) => ({ g, start: g[0].start, end: Math.min(Math.max(...g.map((w) => w.end)), groups[i + 1]?.[0].start ?? Infinity) })).filter((b) => b.end - b.start >= .02);
  const srt = blocks.map(({ g, start, end }, i) => `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${g.map((w) => safeCaption(w.text)).join(" ")}\n`).join("\n");
  const events = blocks.flatMap(({ g, start, end }) => clip.captions === "highlight" ? g.flatMap((w, i) => {
    const eventEnd = Math.min(g[i + 1]?.start ?? end, end);
    if (eventEnd - w.start < .02) return [];
    return [`Dialogue: 0,${stamp(w.start, true)},${stamp(eventEnd, true)},Default,,0,0,0,,${g.map((item, j) => `${j === i ? "{\\c&H005CE7FF&}" : "{\\c&H00FFFFFF&}"}${safeCaption(item.text)}`).join(" ")}`];
  }) : [`Dialogue: 0,${stamp(start, true)},${stamp(end, true)},Default,,0,0,0,,${g.map((w) => safeCaption(w.text)).join(" ")}`]);
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,42,&H00FFFFFF,&H00FFFFFF,&H0020160A,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,54,54,230,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join("\n")}\n`;
  return { srt, ass };
}
export type FaceSample = { t: number; faces: { x: number; size: number }[] };
export function framingCommands(samples: FaceSample[], clip: ShortsClip, analysis: ShortsAnalysis, plan: ShortsPlan) {
  const scaledWidth = Math.max(720, Math.ceil(1280 * analysis.width / analysis.height / 2) * 2);
  let center = clip.center, found = 0;
  const commands = samples.map((sample) => {
    const at = sample.t + clip.start;
    const speaker = analysis.words.find((w) => w.start <= at && w.end >= at)?.speaker;
    const anchor = speaker ? (plan.speakerPositions[speaker] ?? clip.center) : clip.center;
    const nearby = sample.faces.filter((f) => Math.abs(f.x - anchor) < .25).sort((a, b) => Math.abs(a.x - anchor) - Math.abs(b.x - anchor));
    // Never infer that the largest face is the active speaker. A user mapping
    // or the clip's manual anchor chooses the face to follow.
    const match = nearby[0]; if (match) found++;
    const target = match?.x ?? anchor;
    center += Math.max(-.06, Math.min(.06, target - center));
    const x = Math.round(Math.max(0, Math.min(scaledWidth - 720, center * scaledWidth - 360)) / 2) * 2;
    return `${sample.t.toFixed(3)} crop@follow x ${x};`;
  });
  return { commands: commands.join("\n"), found, total: samples.length };
}
export function shortsRenderArgs(clip: ShortsClip) {
  const caption = clip.captions === "none" ? "" : ",ass=captions.ass";
  const filter = clip.framing === "fit"
    ? `[0:v]split[bg][fg];[bg]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:2[back];[fg]scale=720:1280:force_original_aspect_ratio=decrease[front];[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1${caption}[out]`
    : `[0:v]scale=720:1280:force_original_aspect_ratio=increase,${clip.framing === "follow" ? "sendcmd=f=framing.txt," : ""}crop@follow=720:1280:x='max(0,min(iw-720,iw*${clip.center}-360))':y='(ih-1280)/2',setsar=1${caption}[out]`;
  return ["-y", "-nostdin", "-v", "error", "-filter_complex_threads", "1", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", "clip.mp4", "-filter_complex", filter, "-map", "[out]", "-map", "0:a:0", "-t", String(clip.end - clip.start), "-r", "30", "-c:v", "libx264", "-threads:v", "2", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "short.mp4"];
}
