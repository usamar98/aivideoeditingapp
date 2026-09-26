import { z } from "zod";

export const cartoonStyles = { "3d": "Cinematic 3D", "2d": "Hand-drawn 2D", anime: "Anime", clay: "Clay animation" } as const;
export const cartoonModels = {
  "kling-o3": { name: "Kling O3 Pro · character reference", endpoint: "fal-ai/kling-video/o3/pro/reference-to-video", inputMode: "reference", creditsPerSecond: 8, resolutions: ["720p"], defaultResolution: "720p", description: "Character-guided animation · native dialogue" },
  "seedance-2.5": { name: "Seedance 2.5 · character reference", endpoint: "bytedance/seedance-2.5/reference-to-video", inputMode: "reference", creditsPerSecond: 24, resolutions: ["720p"], defaultResolution: "720p", description: "Premium reference-guided animation · native audio" },
  "minimax-h3-turbo": { name: "MiniMax H3 Max Turbo · direct prompt", endpoint: "minimax/h3-max-turbo/text-to-video", inputMode: "text", creditsPerSecond: 3, resolutions: ["480p", "768p", "1080p"], defaultResolution: "768p", description: "Direct text-to-video · no character-image step · native sound" },
  "seedance-2.5-t2v": { name: "Seedance 2.5 · direct prompt", endpoint: "bytedance/seedance-2.5/text-to-video", inputMode: "text", creditsPerSecond: 31, resolutions: ["480p", "720p", "1080p"], defaultResolution: "720p", description: "Direct text-to-video · no character-image step · native audio" },
  "kling-v3": { name: "Kling V3 Pro · direct prompt", endpoint: "fal-ai/kling-video/v3/pro/text-to-video", inputMode: "text", creditsPerSecond: 11, resolutions: ["720p"], defaultResolution: "720p", description: "Direct text-to-video · optional generated sound · 720p export" },
} as const;
export type CartoonModel = keyof typeof cartoonModels;
export type CartoonResolution = "480p" | "720p" | "768p" | "1080p";
export function isDirectCartoonModel(model: CartoonModel) { return cartoonModels[model].inputMode === "text"; }
export function isSeedanceModel(model: CartoonModel) { return model === "seedance-2.5" || model === "seedance-2.5-t2v"; }
export function cartoonResolution(brief: { model: CartoonModel; resolution?: CartoonResolution }) {
  return brief.resolution ?? cartoonModels[brief.model].defaultResolution;
}
export function cartoonPlanCredits(brief: { model: CartoonModel }) { return isDirectCartoonModel(brief.model) ? 2 : CARTOON_PLAN_CREDITS; }
export const CARTOON_PLAN_CREDITS = 40;
export const CHARACTER_IMAGE_MODEL = "openai/gpt-image-2.5/sunburst";
export const cartoonBriefSchema = z.object({
  prompt: z.string().trim().min(20).max(2500),
  style: z.enum(["3d", "2d", "anime", "clay"]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  duration: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  model: z.enum(["kling-o3", "seedance-2.5", "minimax-h3-turbo", "seedance-2.5-t2v", "kling-v3"]),
  resolution: z.enum(["480p", "720p", "768p", "1080p"]).optional(),
  audio: z.boolean().optional(),
  references: z.array(z.object({ assetId: z.string().uuid(), name: z.string().trim().min(1).max(40) })).max(3),
  rightsConfirmed: z.literal(true),
}).superRefine((brief, ctx) => {
  const resolutions: readonly string[] = cartoonModels[brief.model].resolutions;
  if (!resolutions.includes(cartoonResolution(brief))) ctx.addIssue({ code: "custom", path: ["resolution"], message: "Choose a supported resolution for this model." });
  if (isDirectCartoonModel(brief.model) && brief.references.length) ctx.addIssue({ code: "custom", path: ["references"], message: "Direct-prompt models do not accept character images. Remove them or choose a character-reference model." });
  if (brief.audio === false && brief.model !== "kling-v3") ctx.addIssue({ code: "custom", path: ["audio"], message: "This model uses generated audio." });
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
// Credit-only rate card. Keep the reservation RPC in sync; never accept a client-supplied cost.
export function cartoonRenderCredits(brief: Pick<CartoonBrief, "model" | "duration" | "resolution" | "audio">) {
  const resolution = cartoonResolution(brief);
  const allowed: readonly string[] = cartoonModels[brief.model].resolutions;
  if (!allowed.includes(resolution)) throw new Error("Unsupported resolution for this model.");
  const rates: Partial<Record<CartoonModel, Partial<Record<CartoonResolution, number>>>> = {
    "minimax-h3-turbo": { "480p": 2, "768p": 3, "1080p": 6 },
    "seedance-2.5-t2v": { "480p": 15, "720p": 31, "1080p": 76 },
  };
  const rate = brief.model === "kling-v3" ? (brief.audio === false ? 8 : 11) : rates[brief.model]?.[resolution] ?? cartoonModels[brief.model].creditsPerSecond;
  return rate * brief.duration;
}
export type CartoonProjectView = {
  id: string; title: string; status: string; brief: CartoonBrief; storyboard: CartoonStory | null;
  castUrls: Record<string, string>; outputUrl: string | null; error: string | null;
  job: { id: string; status: string; cancelRequested: boolean; phase: string | null } | null;
};
