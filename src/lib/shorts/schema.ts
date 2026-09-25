import { z } from "zod";

export const SHORTS_ANALYSIS_CREDITS = 40;
export const SHORTS_RENDER_CREDITS = 10;
export const SHORTS_MAX_BYTES = 200 * 1024 * 1024;
export const SHORTS_MAX_SECONDS = 1800;
export const SHORTS_TRANSCRIPTION_MODEL = "fal-ai/whisper";
export const shortsUploadSchema = z.object({
  mime: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
  size: z.number().int().positive().max(SHORTS_MAX_BYTES),
});
export const shortsBriefSchema = z.object({
  title: z.string().trim().min(2).max(100), sourceAssetId: z.string().uuid(),
  context: z.string().trim().max(800), language: z.enum(["auto", "en", "es", "fr", "de", "pt", "hi", "ur", "ar"]),
  targetSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  clipCount: z.number().int().min(1).max(5), rightsConfirmed: z.literal(true),
});
export const wordSchema = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), text: z.string().max(120), speaker: z.string().max(60).default("speaker") }).refine((w) => w.end > w.start);
export const shortsClipSchema = z.object({
  id: z.string().regex(/^clip-[1-5]$/), title: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(2).max(400), start: z.number().finite().nonnegative(), end: z.number().finite().positive(),
  framing: z.enum(["follow", "manual", "fit"]), center: z.number().min(0).max(1),
  captions: z.enum(["highlight", "clean", "none"]),
}).refine((c) => c.end - c.start >= 15 && c.end - c.start <= 60, "Each clip must be 15–60 seconds.");
export const shortsPlanSchema = z.object({
  clips: z.array(shortsClipSchema).min(1).max(5),
  captionEdits: z.record(z.string().regex(/^\d{1,5}$/), z.string().trim().min(1).max(80)).default({}),
  speakerPositions: z.record(z.string().max(60), z.number().min(0).max(1)).refine((v) => Object.keys(v).length <= 20),
}).refine((p) => new Set(p.clips.map((c) => c.id)).size === p.clips.length, "Clip IDs must be distinct.");
export const shortsAnalysisSchema = z.object({
  duration: z.number().positive().max(SHORTS_MAX_SECONDS), width: z.number().int().positive(), height: z.number().int().positive(),
  words: z.array(wordSchema).min(1).max(25000),
});
export const shortsOutputSchema = z.record(z.string().regex(/^clip-[1-5]$/), z.object({
  videoPath: z.string(), captionsPath: z.string(), title: z.string(), start: z.number(), end: z.number(),
  framingNote: z.string(), createdAt: z.string(),
}));
export const shortsSelectionSchema = z.array(z.string().regex(/^clip-[1-5]$/)).min(1).max(5).refine((ids) => new Set(ids).size === ids.length);
export type ShortsBrief = z.infer<typeof shortsBriefSchema>;
export type ShortsPlan = z.infer<typeof shortsPlanSchema>;
export type ShortsAnalysis = z.infer<typeof shortsAnalysisSchema>;
export type ShortsClip = z.infer<typeof shortsClipSchema>;
export type ShortsWord = z.infer<typeof wordSchema>;
export function validateShortsPlan(plan: ShortsPlan, analysis: ShortsAnalysis) {
  const speakers = new Set(analysis.words.map((w) => w.speaker));
  if (Object.keys(plan.captionEdits).length > 1000 || Object.keys(plan.captionEdits).some((i) => !analysis.words[Number(i)])) throw new Error("Invalid caption correction.");
  if (Object.keys(plan.speakerPositions).some((s) => !speakers.has(s))) throw new Error("Unknown speaker mapping.");
  for (const clip of plan.clips) {
    if (clip.end > analysis.duration) throw new Error("A clip extends past the source video.");
    if (!analysis.words.some((w) => w.start < clip.end && w.end > clip.start)) throw new Error("Every clip needs spoken content.");
  }
}
export type ShortsProjectView = {
  id: string; title: string; status: string; revision: number; brief: ShortsBrief; plan: ShortsPlan | null;
  analysis: ShortsAnalysis | null; sourceUrl: string | null; error: string | null;
  outputs: { id: string; title: string; videoUrl: string; downloadUrl: string; captionsUrl: string; framingNote: string; start: number; end: number }[];
  job: { id: string; status: string; cancelRequested: boolean; phase: string | null } | null;
};
