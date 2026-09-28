import { describe, it, expect } from "vitest";
import { presenterBriefSchema, presenterCredits, presenterSchema, portraitUploadSchema, type PresenterBrief } from "@/lib/presenter/schema";
import { presenterRenderArgs } from "../trigger/presenter-render";

const brief: PresenterBrief = { title: "Introduction", script: "Hello, welcome to my studio. Let us make something wonderful together today.", duration: 15, resolution: "480p", aspectRatio: "9:16", captions: true, model: "fabric-1.0" };
describe("photo presenter validation and export", () => {
  it("requires explicit consent, adult confirmation and a server-issued asset", () => {
    const input={name:"My portrait",assetId:"10000000-0000-4000-8000-000000000001",consent:true,adult:true};
    expect(presenterSchema.safeParse(input).success).toBe(true);
    expect(presenterSchema.safeParse({...input,consent:false}).success).toBe(false);
    expect(presenterSchema.safeParse({...input,adult:false}).success).toBe(false);
    expect(presenterSchema.safeParse({...input,assetId:"https://another-account/photo.png"}).success).toBe(false);
  });
  it("bounds image types, file size, script, duration and model", () => {
    expect(portraitUploadSchema.safeParse({mime:"image/svg+xml",size:500}).success).toBe(false);
    expect(portraitUploadSchema.safeParse({mime:"image/png",size:9*1024*1024}).success).toBe(false);
    expect(presenterBriefSchema.safeParse(brief).success).toBe(true);
    for (const patch of [{script:"word ".repeat(29)},{model:"arbitrary-model"},{duration:60},{resolution:"4k"}]) expect(presenterBriefSchema.safeParse({...brief,...patch}).success).toBe(false);
  });
  it("quotes all formats and rounds billed seconds up", () => {
    expect(presenterCredits(15,"480p")).toBe(105);
    expect(presenterCredits(30,"480p")).toBe(195);
    expect(presenterCredits(15,"720p")).toBe(165);
    expect(presenterCredits(30,"720p")).toBe(315);
    expect(presenterCredits(10.1,"480p")).toBe(81);
    expect(()=>presenterCredits(NaN,"480p")).toThrow();
  });
  it("fits the speaker without cropping and always includes AI disclosure", () => {
    const args=presenterRenderArgs(brief,10);
    expect(args).toContain("0:v:0"); expect(args).toContain("1:a:0");
    expect(args.join(" ")).toContain("pad=480:854");
    expect(args.join(" ")).toContain("AI presenter");
    expect(args.join(" ")).toContain("subtitles=captions.srt");
    const landscape=presenterRenderArgs({...brief,aspectRatio:"16:9",resolution:"720p",captions:false},10).join(" ");
    expect(landscape).toContain("pad=1280:720"); expect(landscape).not.toContain("subtitles="); expect(landscape).toContain("AI presenter");
    expect(()=>presenterRenderArgs(brief,20)).toThrow();
  });
});
