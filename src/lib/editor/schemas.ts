import { z } from "zod";

export const aspectRatioSchema = z.enum(["16:9", "9:16"]);
export const sceneStatusSchema = z.enum([
  "draft",
  "frame_ready",
  "approved",
  "queued",
  "animating",
  "complete",
  "failed",
]);

export const timedWordSchema = z.object({
  word: z.string().min(1),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().nonnegative(),
  title: z.string().min(1).max(80),
  characters: z.array(z.string()).min(1).max(4),
  setting: z.string().min(1).max(240),
  action: z.string().min(1).max(600),
  dialogue: z.string().max(800),
  camera: z.string().min(1).max(240),
  targetDurationSeconds: z.number().min(3).max(15),
  audioDurationSeconds: z.number().min(0).max(15),
  status: sceneStatusSchema,
  approved: z.boolean(),
  frameUrl: z.string().startsWith("/"),
  voiceId: z.string().min(1),
  captionsEnabled: z.boolean(),
  creditEstimate: z.number().nonnegative(),
  words: z.array(timedWordSchema),
});

export const episodeSchema = z
  .object({
    id: z.string(),
    seriesId: z.string(),
    title: z.string().min(1).max(120),
    number: z.number().int().positive(),
    logline: z.string().min(1).max(300),
    recap: z.string().max(1200),
    aspectRatio: aspectRatioSchema,
    targetDurationSeconds: z.number().min(30).max(60),
    scenes: z.array(sceneSchema).min(1).max(10),
  })
  .superRefine((episode, ctx) => {
    const duration = episode.scenes.reduce(
      (total, scene) => total + scene.audioDurationSeconds,
      0,
    );
    if (duration > episode.targetDurationSeconds) {
      ctx.addIssue({
        code: "custom",
        path: ["scenes"],
        message: `Audio is ${Math.round(duration - episode.targetDurationSeconds)}s over the episode limit.`,
      });
    }
  });

export type Episode = z.infer<typeof episodeSchema>;
export type Scene = z.infer<typeof sceneSchema>;

export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.string(),
  appearance: z.string(),
  wardrobe: z.string(),
  proportions: z.string(),
  voiceName: z.string(),
  voiceId: z.string(),
  referenceUrl: z.string().startsWith("/"),
  approved: z.boolean(),
});

export type Character = z.infer<typeof characterSchema>;

export const storyboardResponseSchema = z.object({
  title: z.string().min(1).max(120),
  logline: z.string().min(1).max(300),
  recap: z.string().max(1200),
  aspectRatio: aspectRatioSchema,
  targetDurationSeconds: z.number().min(30).max(60),
  scenes: z.array(z.object({
    title: z.string().min(1).max(80),
    characters: z.array(z.string()).min(1).max(4),
    setting: z.string().min(1).max(240),
    action: z.string().min(1).max(600),
    dialogue: z.string().max(800),
    camera: z.string().min(1).max(240),
    targetDurationSeconds: z.number().min(3).max(15),
  })).min(3).max(10),
}).superRefine((storyboard, ctx) => {
  const total = storyboard.scenes.reduce((sum, scene) => sum + scene.targetDurationSeconds, 0);
  if (total < 30 || total > 60) ctx.addIssue({ code: "custom", path: ["scenes"], message: "Scene durations must total between 30 and 60 seconds." });
});
