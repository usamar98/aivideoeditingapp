import { z } from "zod";

export const cartoonStyles = { "3d": "Cinematic 3D", "2d": "Hand-drawn 2D", anime: "Anime", clay: "Clay animation" } as const;
export const cartoonModels = {
  "kling-o3": { name: "Kling O3 Pro", endpoint: "fal-ai/kling-video/o3/pro/reference-to-video", creditsPerSecond: 8, description: "Character-guided animation · native dialogue" },
  "seedance-2.5": { name: "Seedance 2.5", endpoint: "bytedance/seedance-2.5/reference-to-video", creditsPerSecond: 24, description: "Premium reference-guided animation · native audio" },
} as const;
export const CARTOON_PLAN_CREDITS = 40;
export const CHARACTER_IMAGE_MODEL = "openai/gpt-image-2.5/sunburst";
export const cartoonBriefSchema = z.object({
  prompt: z.string().trim().min(20).max(2500),
  style: z.enum(["3d", "2d", "anime", "clay"]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  duration: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  model: z.enum(["kling-o3", "seedance-2.5"]),
  references: z.array(z.object({ assetId: z.string().uuid(), name: z.string().trim().min(1).max(40) })).max(3),
  rightsConfirmed: z.literal(true),
});
export const cartoonCharacterSchema = z.object({
  id: z.string().regex(/^c[1-3]$/), name: z.string().min(1).max(40),
  appearance: z.string().min(10).max(600), personality: z.string().min(3).max(200),
  voice: z.string().min(3).max(150), referenceSlot: z.number().int().min(0).max(3),
});
export const cartoonSceneSchema = z.object({
  title: z.string().min(1).max(100), duration: z.number().int().min(5).max(15),
  characterIds: z.array(z.string().regex(/^c[1-3]$/)).min(1).max(3),
  setting: z.string().min(5).max(500), action: z.string().min(5).max(700),
  camera: z.string().min(3).max(200), sound: z.string().max(200),
  dialogue: z.array(z.object({ characterId: z.string().regex(/^c[1-3]$/), text: z.string().min(1).max(180) })).max(2),
});
// Keep structural schema JSON-serializable for the planner; enforce cross-field rules below.
export const cartoonStorySchema = z.object({
  title: z.string().min(1).max(100), synopsis: z.string().min(10).max(500),
  characters: z.array(cartoonCharacterSchema).min(1).max(3), scenes: z.array(cartoonSceneSchema).min(1).max(6),
});
export type CartoonBrief = z.infer<typeof cartoonBriefSchema>;
export type CartoonStory = z.infer<typeof cartoonStorySchema>;
export type CartoonScene = z.infer<typeof cartoonSceneSchema>;
export function validateCartoonStory(story: CartoonStory, brief: CartoonBrief) {
  const ids = story.characters.map((character) => character.id);
  if (new Set(ids).size !== ids.length) throw new Error("Character IDs must be unique.");
  if (story.scenes.reduce((sum, scene) => sum + scene.duration, 0) !== brief.duration) throw new Error(`Scene durations must total ${brief.duration} seconds.`);
  for (const character of story.characters) {
    if (character.referenceSlot > brief.references.length) throw new Error("Character reference is missing.");
  }
  for (let slot = 1; slot <= brief.references.length; slot++) {
    if (story.characters.filter((character) => character.referenceSlot === slot).length !== 1) throw new Error("Each uploaded character must appear exactly once in the cast.");
  }
  for (const scene of story.scenes) {
    if (new Set(scene.characterIds).size !== scene.characterIds.length || scene.characterIds.some((id) => !ids.includes(id))) throw new Error("Scene contains an unknown or repeated character.");
    if (scene.dialogue.some((line) => !scene.characterIds.includes(line.characterId))) throw new Error("A speaker must be present in the scene.");
    const words = scene.dialogue.reduce((sum, line) => sum + line.text.trim().split(/\s+/).length, 0);
    if (words > scene.duration * 2) throw new Error(`Shorten dialogue in “${scene.title}” to ${scene.duration * 2} words or fewer.`);
  }
}
export function cartoonRenderCredits(brief: Pick<CartoonBrief, "model" | "duration">) {
  return cartoonModels[brief.model].creditsPerSecond * brief.duration;
}
export type CartoonProjectView = {
  id: string; title: string; status: string; brief: CartoonBrief; storyboard: CartoonStory | null;
  castUrls: Record<string, string>; outputUrl: string | null; error: string | null;
  job: { id: string; status: string; cancelRequested: boolean; phase: string | null } | null;
};
