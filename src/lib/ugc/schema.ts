import { z } from "zod";

export const UGC_PLAN_CREDITS = 20;
export const UGC_CREDITS_PER_SECOND = 8;
export const UGC_AVATAR_MODEL = "fal-ai/kling-video/ai-avatar/v2/pro";
export const ugcPresenters = {
  warm: { name: "Warm storyteller", direction: "A fictional adult woman in her thirties, warm relaxed smile, casual cream knitwear, bright home studio, approachable delivery" },
  confident: { name: "Confident explainer", direction: "A fictional adult man in his thirties, relaxed confident expression, blue overshirt, clean modern studio, clear explanatory delivery" },
  energetic: { name: "Upbeat creator", direction: "A fictional adult woman in her twenties, expressive friendly face, casual blue tee, airy creative workspace, upbeat delivery" },
  calm: { name: "Calm specialist", direction: "A fictional adult man in his forties, thoughtful friendly expression, neutral linen shirt, warm minimal office, calm measured delivery" },
} as const;
export const productUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443");
}, "Use a public HTTPS product page, without credentials or a custom port.");
export const ugcBriefSchema = z.object({
  productName: z.string().trim().min(2).max(80),
  description: z.string().trim().min(20).max(1200),
  audience: z.string().trim().min(3).max(200),
  benefits: z.string().trim().min(10).max(800),
  offer: z.string().trim().max(150),
  cta: z.string().trim().min(3).max(70),
  productUrl: z.union([z.literal(""), productUrlSchema]),
  productAssetIds: z.array(z.string().uuid()).min(1, "Add at least one product photo.").max(4)
    .refine((ids) => new Set(ids).size === ids.length, "Use distinct product photos."),
  presenter: z.enum(["warm", "confident", "energetic", "calm"]),
  duration: z.union([z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  captions: z.boolean(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid brand color."),
  rightsConfirmed: z.literal(true),
});
export const ugcHookSchema = z.object({
  id: z.enum(["hook-1", "hook-2", "hook-3"]),
  angle: z.string().trim().min(2).max(60),
  hook: z.string().trim().min(3).max(140),
});
export const ugcPlanSchema = z.object({
  title: z.string().trim().min(2).max(100),
  body: z.string().trim().min(5).max(500),
  cta: z.string().trim().min(3).max(100),
  hooks: z.array(ugcHookSchema).length(3),
});
export const ugcSelectionSchema = z.array(z.enum(["hook-1", "hook-2", "hook-3"])).min(1).max(3)
  .refine((ids) => new Set(ids).size === ids.length, "Select each hook once.");
export type UgcBrief = z.infer<typeof ugcBriefSchema>;
export type UgcPlan = z.infer<typeof ugcPlanSchema>;
export type UgcHookId = z.infer<typeof ugcHookSchema>["id"];
export function ugcScript(plan: UgcPlan, id: UgcHookId) {
  const hook = plan.hooks.find((item) => item.id === id);
  if (!hook) throw new Error("Hook not found.");
  return `${hook.hook} ${plan.body} ${plan.cta}`;
}
export function ugcWordLimit(duration: 15 | 30) { return duration === 15 ? 28 : 62; }
export function validateUgcPlan(plan: UgcPlan, brief: UgcBrief) {
  if (new Set(plan.hooks.map((hook) => hook.id)).size !== 3) throw new Error("Three distinct hook IDs are required.");
  if (new Set(plan.hooks.map((hook) => hook.hook.toLowerCase())).size !== 3) throw new Error("Write three different opening hooks.");
  for (const hook of plan.hooks) {
    if (ugcScript(plan, hook.id).split(/\s+/).length > ugcWordLimit(brief.duration))
      throw new Error(`Shorten ${hook.angle}: hook, body and CTA together must be ${ugcWordLimit(brief.duration)} words or fewer.`);
  }
}
export function ugcRenderCredits(duration: 15 | 30, count: number) {
  if (![15, 30].includes(duration) || !Number.isInteger(count) || count < 1 || count > 3) throw new Error("Invalid ad selection.");
  return duration * UGC_CREDITS_PER_SECOND * count;
}
export const ugcOutputsSchema = z.record(z.string().regex(/^hook-[1-3]$/), z.object({
  videoPath: z.string(), captionsPath: z.string(), script: z.string(), angle: z.string(), createdAt: z.string(),
}));
export type UgcProjectView = {
  id: string; title: string; status: string; brief: UgcBrief; plan: UgcPlan | null;
  presenterUrl: string | null; productUrls: string[]; revision: number; error: string | null;
  outputs: { id: string; videoUrl: string; captionsUrl: string; script: string; angle: string; createdAt: string }[];
  job: { id: string; status: string; cancelRequested: boolean; phase: string | null } | null;
};
