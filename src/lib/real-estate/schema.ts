import { z } from "zod";
import { filmModels } from "../films/models";

export const estateModelIds = ["photo-motion", "film-kling-v3-pro", "film-kling-v3-standard", "film-seedance-2.5", "film-veo-3.1", "film-veo-3.1-fast", "film-wan-3", "film-ltx-2.3", "film-ltx-2.3-fast"] as const;
export type EstateModel = typeof estateModelIds[number];
export const ESTATE_TTS = "fal-ai/elevenlabs/tts/eleven-v3";
export const estateModels = estateModelIds.map(id => ({ id, name: id === "photo-motion" ? "Faithful photo motion" : filmModels[id].name,
  rate: id === "photo-motion" ? 1 : filmModels[id].creditsPerSecond,
  note: id === "photo-motion" ? "Recommended for factual listings. Animates your actual photos; no generative changes." : id === "film-seedance-2.5" ? "Premium motion · 720p source · highest credit cost" : id === "film-ltx-2.3-fast" ? "Lower-cost AI preview option" : "AI camera motion · inspect every property detail" }));
const text = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Use single-line text without control characters.");
export const estateRoomSchema = z.object({ assetId: z.uuid(), label: text(40).min(2), narration: text(140).default(""), motion: z.enum(["push", "pan", "still"]).default("push") }).strict();
export const estateBriefSchema = z.object({
  title: text(80).min(2), address: text(100).default(""), price: text(40).default(""),
  agent: text(60).default(""), contact: text(100).default(""), cta: text(60).min(2).default("Book a viewing"),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1b4d4a"),
  model: z.enum(estateModelIds).default("photo-motion"), aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  secondsPerRoom: z.union([z.literal(6), z.literal(8)]).default(6), voice: z.enum(["none", "Rachel", "Aria"]).default("none"),
  rooms: z.array(estateRoomSchema).min(2, "Add at least two property photos.").max(12),
}).strict().superRefine((b, ctx) => {
  if (new Set(b.rooms.map(r => r.assetId)).size !== b.rooms.length) ctx.addIssue({ code: "custom", message: "Use each photo only once.", path: ["rooms"] });
  b.rooms.forEach((r, i) => { if (r.narration && r.narration.split(/\s+/).length > (b.secondsPerRoom === 6 ? 11 : 15)) ctx.addIssue({ code: "custom", message: `Room ${i + 1}: shorten narration to ${b.secondsPerRoom === 6 ? 11 : 15} words.`, path: ["rooms", i, "narration"] }); });
  if (b.voice !== "none" && b.rooms.some(r => !r.narration)) ctx.addIssue({ code: "custom", message: "Add narration for every room, or choose no voiceover.", path: ["rooms"] });
});
export type EstateBrief = z.infer<typeof estateBriefSchema>;
export function estateSeconds(b: EstateBrief) { return b.rooms.length * b.secondsPerRoom + 4; }
export function estateCredits(b: EstateBrief) {
  return 10 + b.rooms.length * b.secondsPerRoom * estateModels.find(m => m.id === b.model)!.rate + (b.voice === "none" ? 0 : b.rooms.length * 5);
}
export function estatePrompt(room: EstateBrief["rooms"][number]) {
  const motion = { push: "Very slow, small forward camera push", pan: "Subtle slow lateral camera drift", still: "Locked-off camera, barely perceptible natural motion" }[room.motion];
  return `${motion}. A single continuous real estate listing shot of the supplied photograph. Keep the exact room geometry, doors, windows, walls, furniture, materials and visible exterior unchanged. Do not invent unseen spaces or move through walls. No people, staging, renovation, added amenities, text, transitions or cuts. Preserve straight architectural lines and natural lighting. This is not a redesigned property.`;
}
export function estateVideoInput(b: EstateBrief, i: number, url: string, user: string): Record<string, unknown> {
  if (b.model === "photo-motion") throw new Error("Photo motion does not use a paid video model");
  const m = filmModels[b.model], prompt = estatePrompt(b.rooms[i]), duration = b.secondsPerRoom;
  switch (m.adapter) {
    case "kling": return { prompt, start_image_url: url, duration: String(duration), generate_audio: false, shot_type: "customize" };
    case "seedance": return { prompt, image_url: url, duration: String(duration), aspect_ratio: "auto", resolution: "720p", generate_audio: false, codec: "H264", bitrate_mode: "standard", end_user_id: user };
    case "veo": return { prompt, image_url: url, duration: `${duration}s`, resolution: m.defaultResolution, aspect_ratio: b.aspectRatio, generate_audio: false };
    case "wan": return { prompt, start_image_url: url, duration, resolution: m.defaultResolution, aspect_ratio: b.aspectRatio, audio: false, enable_safety_checker: true };
    case "ltx": return { prompt, image_url: url, duration, resolution: m.defaultResolution, aspect_ratio: b.aspectRatio, fps: 24, generate_audio: false };
    default: throw new Error("Unsupported listing model");
  }
}
export type EstateProject = { id: string; title: string; brief: EstateBrief; status: string; error: string | null; videoUrl: string | null; captionsUrl: string | null; photos: { id: string; url: string | null }[]; job: { id: string; status: string; phase: string | null; cancelRequested: boolean } | null };
