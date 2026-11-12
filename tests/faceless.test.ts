import { describe,expect,it } from "vitest";
import { briefSchema,defaultBrief,sampleStoryboard,scriptToStoryboard,validateNarration } from "@/lib/faceless/schema";
import { alignmentToSrt,alignmentSchema,srtTimestamp } from "@/lib/faceless/captions";
import { DEFAULT_FACELESS_IMAGE_MODEL, facelessImageRequest } from "@/lib/faceless/models";
describe("faceless input and captions",()=>{
  it("routes new scene artwork and resumes legacy projects with their original model", () => {
    expect(defaultBrief.imageModel).toBe(DEFAULT_FACELESS_IMAGE_MODEL);
    expect(facelessImageRequest(defaultBrief.imageModel, "9:16", "A planet").endpoint).toBe("blackforestlabs/flux-3/klein/text-to-image");
    expect(facelessImageRequest(defaultBrief.imageModel, "9:16", "A planet").input).toMatchObject({ image_size: "portrait_16_9", output_format: "jpeg" });
    expect(facelessImageRequest("nano-banana-2.1", "16:9", "A landscape")).toMatchObject({
      endpoint: "google/nano-banana-2.1", input: { aspect_ratio: "16:9", resolution: "1K", num_images: 1 },
    });
    const legacy = briefSchema.parse({ ...defaultBrief, topic: "A very old project", imageModel: undefined });
    expect(facelessImageRequest(legacy.imageModel, "16:9", "A landscape").endpoint).toBe("fal-ai/flux/schnell");
    expect(briefSchema.safeParse({ ...legacy, imageModel: "unknown-model" }).success).toBe(false);
  });
  it("rejects unsupported formats and excessive prompts",()=>{expect(briefSchema.safeParse({...defaultBrief,topic:"x".repeat(2000)}).success).toBe(false);expect(briefSchema.safeParse({...defaultBrief,topic:"An interesting story",aspectRatio:"1:1"}).success).toBe(false);});
  it("preserves all user script words in order",()=>{const topic="The night sky tells a story of ancient stars and distant galaxies waiting for us to discover their secrets.";const result=scriptToStoryboard({...defaultBrief,mode:"script",topic});expect(result.scenes.map(s=>s.narration).join(" ")).toBe(topic);expect(result.scenes.length).toBe(3);});
  it.each([30, 60] as const)("balances short scripts for a %i-second video", (duration) => {
    for (const topic of ["The lights above us left their stars long before we could see it.", "a b c d e f g h i j k l"]) {
      const { scenes } = scriptToStoryboard({ ...defaultBrief, mode: "script", duration, topic });
      const lengths = scenes.map(({ narration }) => narration.split(" ").length);
      expect(scenes.map(({ narration }) => narration).join(" ")).toBe(topic);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
      expect(scenes.every(({ narration }) => narration.length >= 5)).toBe(true);
    }
  });
  it("enforces duration-based word budgets",()=>{expect(()=>validateNarration(sampleStoryboard,30)).not.toThrow();expect(()=>scriptToStoryboard({...defaultBrief,mode:"script",topic:"word ".repeat(100)})).toThrow("under 80");});
  it("uses provider character timestamps and removes subtitle markup",()=>{const text="Hello <world> this is a test.";const chars=Array.from(text);const srt=alignmentToSrt({characters:chars,character_start_times_seconds:chars.map((_,i)=>i/10),character_end_times_seconds:chars.map((_,i)=>(i+1)/10)});expect(srt).toContain("00:00:00,000 -->");expect(srt).toContain("Hello world");expect(srt).not.toContain("<world>");});
  it("rejects malformed and backwards timing",()=>{expect(alignmentSchema.safeParse({characters:["a"],character_start_times_seconds:[2],character_end_times_seconds:[1]}).success).toBe(false);expect(alignmentSchema.safeParse({characters:["a"],character_start_times_seconds:[],character_end_times_seconds:[]}).success).toBe(false);expect(srtTimestamp(61.125)).toBe("00:01:01,125");});
});
