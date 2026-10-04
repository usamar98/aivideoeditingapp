import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { estateBriefSchema, estateModelIds, estateCredits, estateSeconds, estatePrompt, estateVideoInput, ESTATE_TTS } from "@/lib/real-estate/schema";
import { filmModels } from "@/lib/films/models";
import { estateEditorial } from "@/lib/real-estate/editorial";
import { getFeature } from "@/lib/features/catalog";
import { estateClipArgs, estateJoinArgs, estateCaptions, wrapEstateText } from "../trigger/real-estate-render";
import { estateBrief as brief } from "./fixtures/real-estate";
type Schema = { $ref?: string; anyOf?: Schema[]; type?: string; enum?: unknown[]; minimum?: number; maximum?: number; required?: string[]; properties?: Record<string, Schema>; items?: Schema };
const snapshot = JSON.parse(readFileSync("tests/fixtures/real-estate-fal-schemas.json", "utf8")) as { contracts: Record<string, { input: Schema; schemas: Record<string, Schema> }> };
function accepts(s: Schema, v: unknown, defs: Record<string, Schema>): boolean {
  if (s.$ref) return accepts(defs[s.$ref.split("/").at(-1)!], v, defs);
  if (s.anyOf && !s.anyOf.some(a => accepts(a, v, defs))) return false;
  if (s.enum && !s.enum.includes(v)) return false;
  if (s.type === "null") return v === null;
  if (["string", "number", "boolean"].includes(s.type || "") && typeof v !== s.type) return false;
  if (s.type === "integer" && !Number.isInteger(v)) return false;
  if (typeof v === "number" && ((s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum))) return false;
  if (s.type === "array") return Array.isArray(v) && (!s.items || v.every(x => accepts(s.items!, x, defs)));
  if (s.type === "object") { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const r = v as Record<string, unknown>; return !(s.required || []).some(k => r[k] === undefined) && Object.entries(r).every(([k, a]) => !!s.properties?.[k] && accepts(s.properties[k], a, defs)); }
  return true;
}
describe("real estate listing contracts", () => {
  it.each(estateModelIds.filter(id => id !== "photo-motion"))("uses the verified image-guided API for %s", model => {
    for (const secondsPerRoom of [6, 8] as const) for (const aspectRatio of ["9:16", "16:9"] as const) {
      const input = estateVideoInput({ ...brief, model, secondsPerRoom, aspectRatio }, 0, "https://fal.media/room.png", "owner");
      const c = snapshot.contracts[filmModels[model].endpoint]; expect(accepts(c.input, input, c.schemas), JSON.stringify(input)).toBe(true);
      expect(input.generate_audio ?? input.audio).toBe(false);
      expect(input.start_image_url ?? input.image_url).toBe("https://fal.media/room.png");
    }
  });
  it("verifies the optional voice API", () => { const c = snapshot.contracts[ESTATE_TTS]; expect(accepts(c.input, { text: brief.rooms[0].narration, voice: "Rachel", stability: .7, language_code: "en" }, c.schemas)).toBe(true); });
  it("rejects fabricated inputs, duplicate photos and overlong speech", () => {
    for (const patch of [{ rooms: [] }, { rooms: [brief.rooms[0], brief.rooms[0]] }, { secondsPerRoom: 30 }, { model: "arbitrary-model" }, { brandColor: "red,drawtext=bad" }, { title: "injected\ntext" }, { rooms: [ { ...brief.rooms[0], narration: "word ".repeat(16).trim() }, brief.rooms[1] ] }]) expect(estateBriefSchema.safeParse({ ...brief, ...patch }).success).toBe(false);
    expect(estateBriefSchema.safeParse({ ...brief, voice: "Aria", rooms: brief.rooms.map(r => ({ ...r, narration: "" })) }).success).toBe(false);
    expect(() => estateVideoInput(brief, 0, "url", "owner")).toThrow(/paid video/);
    expect(estatePrompt(brief.rooms[0])).toContain("Do not invent unseen spaces");
  });
  it("shows deterministic prices and duration including the end card", () => {
    expect(estateSeconds(brief)).toBe(16); expect(estateCredits(brief)).toBe(22);
    expect(estateCredits({ ...brief, voice: "Rachel" })).toBe(32);
    expect(estateCredits({ ...brief, model: "film-seedance-2.5" })).toBe(970);
  });
  it("preserves composition, discards provider audio and avoids filter-text injection", () => {
    const args = estateClipArgs(brief, 0, false).join(" "); expect(args).toContain("force_original_aspect_ratio=decrease"); expect(args).toContain("zoompan"); expect(args).toContain("anullsrc"); expect(args).toContain("1:a:0"); expect(args).not.toContain("crop=");
    const ai = estateClipArgs({ ...brief, model: "film-veo-3.1", aspectRatio: "9:16" }, 0, true).join(" ");
    expect(ai).toContain("AI-animated"); expect(ai).toContain("voice-0.mp3"); expect(ai).toContain("textfile=label-0.txt:expansion=none"); expect(ai).not.toContain(brief.rooms[0].label);
    expect(estateClipArgs(brief, 0, false, true)).toContain("4"); expect(estateJoinArgs()).toContain("listing.mp4");
    expect(estateCaptions(brief)).toContain("00:00:06,000 --> 00:00:12,000"); expect(wrapEstateText("long ".repeat(30)).split("\n").every(l => l.length <= 34)).toBe(true);
  });
  it("publishes substantial accurate SEO without fake generated examples", () => {
    const f = getFeature("ai-real-estate-video-generator")!; expect(f.seo.canonicalPath).toBe("/features/ai-real-estate-video-generator"); expect(f.exampleMedia).toEqual([]); expect(f.relatedFeatures.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(estateEditorial).split(/\s+/).length).toBeGreaterThan(800); expect(f.limitations.join(" ")).toContain("AI motion can alter architecture");
  });
});
