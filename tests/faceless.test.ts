import { describe,expect,it } from "vitest";
import { briefSchema,defaultBrief,sampleStoryboard,scriptToStoryboard,validateNarration } from "@/lib/faceless/schema";
import { alignmentToSrt,alignmentSchema,srtTimestamp } from "@/lib/faceless/captions";
describe("faceless input and captions",()=>{
  it("rejects unsupported formats and excessive prompts",()=>{expect(briefSchema.safeParse({...defaultBrief,topic:"x".repeat(2000)}).success).toBe(false);expect(briefSchema.safeParse({...defaultBrief,topic:"An interesting story",aspectRatio:"1:1"}).success).toBe(false);});
  it("preserves all user script words in order",()=>{const topic="The night sky tells a story of ancient stars and distant galaxies waiting for us to discover their secrets.";const result=scriptToStoryboard({...defaultBrief,mode:"script",topic});expect(result.scenes.map(s=>s.narration).join(" ")).toBe(topic);expect(result.scenes.length).toBe(3);});
  it("enforces duration-based word budgets",()=>{expect(()=>validateNarration(sampleStoryboard,30)).not.toThrow();expect(()=>scriptToStoryboard({...defaultBrief,mode:"script",topic:"word ".repeat(100)})).toThrow("under 80");});
  it("uses provider character timestamps and removes subtitle markup",()=>{const text="Hello <world> this is a test.";const chars=Array.from(text);const srt=alignmentToSrt({characters:chars,character_start_times_seconds:chars.map((_,i)=>i/10),character_end_times_seconds:chars.map((_,i)=>(i+1)/10)});expect(srt).toContain("00:00:00,000 -->");expect(srt).toContain("Hello world");expect(srt).not.toContain("<world>");});
  it("rejects malformed and backwards timing",()=>{expect(alignmentSchema.safeParse({characters:["a"],character_start_times_seconds:[2],character_end_times_seconds:[1]}).success).toBe(false);expect(alignmentSchema.safeParse({characters:["a"],character_start_times_seconds:[],character_end_times_seconds:[]}).success).toBe(false);expect(srtTimestamp(61.125)).toBe("00:01:01,125");});
});
