import { z } from "zod";

export const AD_REMAKE_MAX_BYTES = 100 * 1024 * 1024;
export const adRemakeModels = {
  standard: { name: "Kling O3 Standard", endpoint: "fal-ai/kling-video/o3/standard/video-to-video/edit", creditsPerSecond: 6 },
  pro: { name: "Kling O3 Pro", endpoint: "fal-ai/kling-video/o3/pro/video-to-video/edit", creditsPerSecond: 8 },
} as const;
const line = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Use text without line breaks or control characters.");
export const adRemakeUploadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("video"), mime: z.enum(["video/mp4", "video/quicktime"]), size: z.number().int().positive().max(AD_REMAKE_MAX_BYTES) }).strict(),
  z.object({ kind: z.literal("image"), mime: z.enum(["image/png", "image/jpeg", "image/webp"]), size: z.number().int().positive().max(8 * 1024 * 1024) }).strict(),
]);
export const adRemakeBriefSchema = z.object({
  title: line(2, 80), productName: line(2, 80), instructions: z.string().trim().min(20).max(1500),
  sourceAssetId: z.uuid(), productAssetIds: z.array(z.uuid()).min(1).max(4).refine(ids => new Set(ids).size === ids.length, "Use distinct product images."),
  seconds: z.number().int().min(3).max(15), model: z.enum(["standard", "pro"]),
  keepAudio: z.boolean(), cta: line(0, 60), brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), rightsConfirmed: z.literal(true),
}).strict();
export type AdRemakeBrief = z.infer<typeof adRemakeBriefSchema>;
export function adRemakeCredits(b: AdRemakeBrief) { return b.seconds * adRemakeModels[b.model].creditsPerSecond; }
export function adRemakeInput(b: AdRemakeBrief, videoUrl: string, images: string[]) {
  if (images.length !== b.productAssetIds.length) throw new Error("Missing product references");
  return {
    prompt: `Edit @Video1 into an advertisement for ${b.productName}. Replace the featured product with @Element1, preserving its shape, packaging and colors from the reference images. Preserve the reference clip's camera movement, scene order, pacing and composition unless the edit instructions request a change. Remove the original product branding and unsupported claims. Do not impersonate a real person or invent endorsements, product claims or guarantees. Edit instructions: ${b.instructions}`,
    video_url: videoUrl, keep_audio: b.keepAudio, shot_type: "customize",
    elements: [{ frontal_image_url: images[0], ...(images.length > 1 ? { reference_image_urls: images.slice(1) } : {}) }],
  };
}
export function validateAdRemakeSource(info: { seconds: number; width: number; height: number }, reservedSeconds: number) {
  if (!Number.isFinite(info.seconds) || info.seconds < 3 || info.seconds > 15 || info.seconds > reservedSeconds + .01 || reservedSeconds - info.seconds >= 1.01)
    throw new Error("Reference must be 3–15 seconds and match the reviewed credit estimate.");
  if (!Number.isInteger(info.width) || !Number.isInteger(info.height) || Math.min(info.width, info.height) < 720 || Math.max(info.width, info.height) > 3840)
    throw new Error("Reference resolution must be between 720 and 3840 pixels per side.");
}
export type AdRemakeProject = {
  id: string; title: string; brief: AdRemakeBrief; status: string; error: string | null;
  sourceUrl: string | null; productUrls: string[]; videoUrl: string | null;
  job: { id: string; status: string; phase: string | null; cancelRequested: boolean } | null;
};
