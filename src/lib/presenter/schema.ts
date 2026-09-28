import { z } from "zod";

export const PRESENTER_MODEL = "veed/fabric-1.0";
export const PRESENTER_CONSENT_VERSION = "photo-presenter-v1";
export const presenterConsentText = "I am this adult presenter or have their explicit permission to animate their likeness with AI. I have rights to this photo and authorize ETA to send it and my approved scripts to its generation providers. I will disclose synthetic media where required and will not impersonate someone or fabricate their endorsement.";
export const portraitUploadSchema = z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), size: z.number().int().positive().max(8 * 1024 * 1024) });
export const presenterSchema = z.object({ name: z.string().trim().min(2).max(80), assetId: z.uuid(), consent: z.literal(true), adult: z.literal(true) });
export const presenterBriefSchema = z.object({
  title: z.string().trim().min(2).max(100), script: z.string().trim().min(10).max(650),
  duration: z.union([z.literal(15), z.literal(30)]), resolution: z.enum(["480p", "720p"]),
  aspectRatio: z.enum(["9:16", "16:9"]), captions: z.boolean(), model: z.literal("fabric-1.0"),
}).superRefine((brief, ctx) => {
  if (brief.script.split(/\s+/).length > (brief.duration === 15 ? 28 : 62)) ctx.addIssue({ code: "custom", path: ["script"], message: `Keep the script under ${brief.duration === 15 ? 28 : 62} words for this duration.` });
});
export type PresenterBrief = z.infer<typeof presenterBriefSchema>;
// Credit-only tariff; the server-owned SQL reservation/settlement uses the same rates.
export function presenterCredits(seconds: number, resolution: PresenterBrief["resolution"]) {
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 30 || !["480p", "720p"].includes(resolution)) throw new Error("Unsupported presenter format.");
  return 15 + Math.ceil(seconds) * (resolution === "480p" ? 6 : 10);
}
export type PresenterView = { id: string; name: string; portraitUrl: string | null; revoked: boolean };
export type PresenterProject = {
  id: string; title: string; brief: PresenterBrief; status: string; presenter: PresenterView;
  videoUrl: string | null; captionsUrl: string | null; error: string | null;
  job: { id: string; status: string; phase: string | null; cancelRequested: boolean; credits: number; used: number | null } | null;
};
