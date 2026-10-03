import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filmDemo } from "@/lib/films/demo";
import { filmModels, filmModelIds, filmRenderCredits, isFilmModel } from "@/lib/films/models";
import { filmVideoInput, filmPlannerPrompt } from "@/lib/films/prompts";
import { cartoonBriefSchema, cartoonPlanCredits, cartoonRenderCredits, validateCartoonStory } from "@/lib/cartoons/schema";
import { cartoonVideoInput, sceneImagePrompt, characterImagePrompt } from "@/lib/cartoons/prompts";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { getFeature } from "@/lib/features/catalog";
import { filmEditorial } from "@/lib/films/editorial";

type Schema = { $ref?:string; anyOf?:Schema[]; type?:string; enum?:unknown[]; const?:unknown; minimum?:number;maximum?:number;minLength?:number;maxLength?:number; required?:string[]; properties?:Record<string,Schema>;items?:Schema };
const snapshot = JSON.parse(readFileSync("tests/fixtures/film-fal-schemas.json","utf8")) as {contracts:Record<string,{input:Schema;schemas:Record<string,Schema>}>};
function accepts(schema:Schema,value:unknown,definitions:Record<string,Schema>):boolean {
  if (schema.$ref) return accepts(definitions[schema.$ref.split("/").at(-1)!],value,definitions);
  if (schema.anyOf && !schema.anyOf.some(s=>accepts(s,value,definitions))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.const !== undefined && schema.const !== value) return false;
  if (schema.type === "null") return value === null;
  if (schema.type === "string" && typeof value !== "string") return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.type === "number" && typeof value !== "number") return false;
  if (schema.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) return false;
  if (typeof value === "number" && ((schema.minimum !== undefined && value < schema.minimum)||(schema.maximum !== undefined && value > schema.maximum))) return false;
  if (typeof value === "string" && ((schema.minLength !== undefined && value.length < schema.minLength)||(schema.maxLength !== undefined && value.length > schema.maxLength))) return false;
  if (schema.type === "array") return Array.isArray(value) && (!schema.items || value.every(v=>accepts(schema.items!,v,definitions)));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string,unknown>;
    return !(schema.required||[]).some(k=>record[k]===undefined) && Object.entries(record).every(([k,v])=>!!schema.properties?.[k] && accepts(schema.properties[k],v,definitions));
  }
  return true;
}

describe("short film contracts",()=>{
  it.each(filmModelIds)("validates %s against fal's captured public input contract",model=>{
    for (const audio of [true,false]) for (const aspectRatio of ["16:9","9:16"] as const) {
      const brief = cartoonBriefSchema.parse({...filmDemo.brief,model,resolution:filmModels[model].defaultResolution,audio,aspectRatio});
      const request = filmVideoInput(filmDemo.storyboard!.scenes[0],filmDemo.storyboard!,brief,"https://fal.media/frame.png",["https://fal.media/cast.png"],"owner");
      const contract = snapshot.contracts[request.endpoint];
      expect(contract).toBeDefined();
      expect(accepts(contract.input,request.input,contract.schemas),JSON.stringify(request)).toBe(true);
      expect(cartoonVideoInput(filmDemo.storyboard!.scenes[0],filmDemo.storyboard!,brief,"https://fal.media/frame.png",["https://fal.media/cast.png"],"owner")).toEqual(request);
      expect(cartoonPlanCredits(brief)).toBe(40);
      expect(cartoonRenderCredits(brief)).toBe(filmRenderCredits(model,24));
      expect(cartoonRenderCredits({...brief,duration:48})).toBe(filmRenderCredits(model,24)*2);
    }
  });
  it("keeps modes, runtimes, consent and resolutions explicit",()=>{
    expect(filmModelIds).toHaveLength(16);
    expect(new Set(filmModelIds.map(id=>filmModels[id].endpoint)).size).toBe(16);
    for(const change of [{kind:undefined},{model:"kling-o3"},{duration:30},{resolution:"480p"},{style:"clay"},{rightsConfirmed:false},{model:"external"}]) expect(cartoonBriefSchema.safeParse({...filmDemo.brief,...change}).success).toBe(false);
    expect(cartoonBriefSchema.safeParse({...cartoonDemo.brief,model:"film-veo-3.1"}).success).toBe(false);
    expect(isFilmModel("toString")).toBe(false);
    expect(()=>filmRenderCredits("film-veo-3.1",600)).toThrow();
  });
  it("enforces eight-second shots and silent-film dialogue",()=>{
    validateCartoonStory(filmDemo.storyboard!,filmDemo.brief);
    const story=structuredClone(filmDemo.storyboard!);
    story.scenes[0].duration=7;story.scenes[1].duration=9;
    expect(()=>validateCartoonStory(story,filmDemo.brief)).toThrow(/eight-second/);
    expect(()=>validateCartoonStory(filmDemo.storyboard!,{...filmDemo.brief,audio:false})).toThrow(/spoken/);
    for(const scene of story.scenes){scene.duration=8;scene.dialogue=[];}
    validateCartoonStory(story,{...filmDemo.brief,audio:false});
    expect(filmPlannerPrompt({...filmDemo.brief,audio:false})).toContain("NO dialogue");
  });
  it("uses cinematic rather than cartoon prompting and authoritative references",()=>{
    expect(filmPlannerPrompt(filmDemo.brief)).toContain("EACH exactly 8 seconds");
    expect(sceneImagePrompt(filmDemo.storyboard!.scenes[0],filmDemo.storyboard!,filmDemo.brief)).toContain("EXACT reference identities");
    expect(characterImagePrompt({...filmDemo.storyboard!.characters[0],referenceSlot:1},filmDemo.brief)).toContain("uploaded image is authoritative");
  });
  it("keeps maximal valid scene prompts within every provider's length bounds",()=>{
    const story=structuredClone(filmDemo.storyboard!);
    story.characters=[1,2,3].map(n=>({...story.characters[0],id:`c${n}`,name:"n".repeat(40),voice:"v".repeat(150)}));
    const scene={...story.scenes[0],characterIds:["c1","c2","c3"],setting:"s".repeat(500),action:"a".repeat(700),camera:"c".repeat(200),sound:"s".repeat(200),dialogue:[{characterId:"c1",text:"a".repeat(180)},{characterId:"c2",text:"b".repeat(180)}]};
    for(const model of filmModelIds) {
      const request=filmVideoInput(scene,story,{...filmDemo.brief,model},"https://fal.media/frame.png",Array(3).fill("https://fal.media/cast.png"),"owner");
      const contract=snapshot.contracts[request.endpoint];
      expect(accepts(contract.input,request.input,contract.schemas),model).toBe(true);
    }
  });
  it("publishes an honest, substantial SEO guide through the existing catalog",()=>{
    const feature=getFeature("ai-short-film-generator")!;
    expect(feature.seo.canonicalPath).toBe("/features/ai-short-film-generator");
    expect(feature.exampleMedia).toEqual([]);
    expect(feature.relatedFeatures.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(filmEditorial).split(/\s+/).length).toBeGreaterThan(800);
    expect(feature.limitations.join(" ")).toContain("No full timeline");
  });
});
