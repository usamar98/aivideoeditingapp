import { describe, expect, it, vi } from "vitest";
import type { FalClient } from "@fal-ai/client";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { cartoonBriefSchema, cartoonStorySchema, cartoonRenderCredits, cartoonPlanCredits, validateCartoonStory, type CartoonModel, type CartoonResolution } from "@/lib/cartoons/schema";
import { cartoonVideoInput, characterImagePrompt } from "@/lib/cartoons/prompts";
import { cartoonFalClient, runFalStage } from "../trigger/cartoon-fal";
import { cartoonClipArgs, isCartoonMediaUrl } from "../trigger/cartoon-media";

const story = cartoonDemo.storyboard!;
describe("cartoon contracts", () => {
  it.each([
    ["minimax-h3-turbo", "480p", true, 30], ["minimax-h3-turbo", "768p", true, 45], ["minimax-h3-turbo", "1080p", true, 90],
    ["seedance-2.5-t2v", "480p", true, 225], ["seedance-2.5-t2v", "720p", true, 465], ["seedance-2.5-t2v", "1080p", true, 1140],
    ["kling-v3", "720p", true, 165], ["kling-v3", "720p", false, 120],
  ] as [CartoonModel, CartoonResolution, boolean, number][])("quotes %s at %s (audio %s) without image-generation charges", (model, resolution, audio, credits) => {
    const brief = cartoonBriefSchema.parse({ ...cartoonDemo.brief, model, resolution, audio });
    expect(cartoonRenderCredits(brief)).toBe(credits);
    expect(cartoonPlanCredits(brief)).toBe(2);
    expect(cartoonRenderCredits({ ...brief, duration: 60 })).toBe(credits * 4);
    const request = cartoonVideoInput(story.scenes[0], story, brief, "", [], "owner");
    expect(request.input).not.toHaveProperty("image_urls");
    expect(request.input).not.toHaveProperty("start_image_url");
    expect(request.input).not.toHaveProperty("elements");
    expect(request.input.prompt).toContain(story.characters[0].appearance);
    if (model === "minimax-h3-turbo") expect(request.input).toMatchObject({ duration: 5, resolution: resolution.toUpperCase(), prompt_expansion_mode: "disabled" });
    if (model === "seedance-2.5-t2v") expect(request.input).toMatchObject({ duration: "5", resolution, generate_audio: true, end_user_id: "owner" });
    if (model === "kling-v3") {
      expect(request.input).toMatchObject({ duration: "5", generate_audio: audio });
      expect(request.input).not.toHaveProperty("resolution");
    }
  });
  it("rejects incompatible model settings and image references rather than silently ignoring them", () => {
    for (const changes of [
      { model: "minimax-h3-turbo", resolution: "720p" }, { model: "seedance-2.5-t2v", resolution: "768p" },
      { model: "kling-v3", resolution: "1080p" }, { model: "minimax-h3-turbo", audio: false },
      { model: "kling-v3", references: [{ assetId: "10000000-0000-4000-8000-000000000001", name: "Fox" }] },
    ]) expect(cartoonBriefSchema.safeParse({ ...cartoonDemo.brief, ...changes }).success).toBe(false);
  });
  it("preserves chosen export dimensions and gives silent films a compatible silent audio track", () => {
    const args = cartoonClipArgs(0, 5, true, "1080p", false);
    expect(args.join(" ")).toContain("scale=1080:1920");
    expect(args).toContain("anullsrc=r=48000:cl=stereo");
    expect(args).toContain("1:a:0");
    expect(args).not.toContain("0:a:0");
    const mini = cartoonVideoInput(story.scenes[0], story, { ...cartoonDemo.brief, model: "kling-v3", audio: false }, "", [], "owner");
    expect(mini.input.prompt).toContain("Silent film");
    expect(mini.input.prompt).not.toContain("says in English");
  });
  it("validates the sample and charges the model-specific duration", () => {
    validateCartoonStory(cartoonStorySchema.parse(story), cartoonBriefSchema.parse(cartoonDemo.brief));
    expect(cartoonRenderCredits(cartoonDemo.brief)).toBe(120);
    expect(cartoonRenderCredits({ model: "seedance-2.5", duration: 60 })).toBe(1440);
  });
  it("requires consent, bounded duration, and an allowlisted model", () => {
    for (const changes of [{ rightsConfirmed: false }, { duration: 600 }, { model: "https://evil.test" }, { prompt: "hi" }]) expect(cartoonBriefSchema.safeParse({ ...cartoonDemo.brief, ...changes }).success).toBe(false);
  });
  it("rejects unknown speakers, duplicate cast, missing references and excessive dialogue", () => {
    const make = () => structuredClone(story);
    const unknown = make(); unknown.scenes[0].dialogue[0].characterId = "c3";
    expect(() => validateCartoonStory(unknown, cartoonDemo.brief)).toThrow(/speaker/);
    const duplicate = make(); duplicate.characters[1].id = "c1";
    expect(() => validateCartoonStory(duplicate, cartoonDemo.brief)).toThrow(/unique/);
    expect(() => validateCartoonStory(story, { ...cartoonDemo.brief, references: [{ name: "Nova", assetId: "a" }] })).toThrow(/uploaded/);
    const long = make(); long.scenes[0].dialogue[0].text = "hello ".repeat(20);
    expect(() => validateCartoonStory(long, cartoonDemo.brief)).toThrow(/Shorten/);
    const duration = make(); duration.scenes[0].duration = 10;
    expect(() => validateCartoonStory(duration, cartoonDemo.brief)).toThrow(/total/);
  });
  it("binds Kling character elements and enables native audio", () => {
    const request = cartoonVideoInput(story.scenes[0], story, cartoonDemo.brief, "frame", ["nova", "bolt"], "owner");
    expect(request.endpoint).toBe("fal-ai/kling-video/o3/pro/reference-to-video");
    expect(request.input).toMatchObject({ generate_audio: true, duration: "5", start_image_url: "frame", elements: [{ frontal_image_url: "nova" }, { frontal_image_url: "bolt" }] });
    expect(request.input.prompt).toContain("@Element1 is Nova");
    expect(request.input.prompt).toContain(story.scenes[0].dialogue[0].text);
  });
  it("maps Seedance image indexes to cast, supplies end user and uses 720p", () => {
    const request = cartoonVideoInput(story.scenes[0], story, { ...cartoonDemo.brief, model: "seedance-2.5" }, "frame", ["nova", "bolt"], "owner");
    expect(request.input).toMatchObject({ image_urls: ["frame", "nova", "bolt"], resolution: "720p", end_user_id: "owner", generate_audio: true });
    expect(request.input.prompt).toContain("@Image2 is Nova");
    expect(characterImagePrompt({ ...story.characters[0], referenceSlot: 1 }, cartoonDemo.brief)).toContain("uploaded image defines");
  });
  it("rejects SSRF targets and preserves audio with bounded FFmpeg threads", () => {
    for (const url of ["http://fal.media/x", "https://fal.media.evil.test/x", "https://127.0.0.1/x", "https://storage.googleapis.com/private/x", "https://user@fal.media/x"]) expect(isCartoonMediaUrl(url)).toBe(false);
    expect(isCartoonMediaUrl("https://v3.fal.media/files/video.mp4")).toBe(true);
    expect(isCartoonMediaUrl("https://storage.googleapis.com/falserverless/output.mp4")).toBe(true);
    const args = cartoonClipArgs(0, 5, true);
    expect(args).toContain("0:a:0"); expect(args).not.toContain("-an"); expect(args).toContain("2"); expect(args.join(" ")).toContain("scale=720:1280");
  });
});

describe("durable fal submission", () => {
  it("does not let the SDK retry non-idempotent POST requests", async () => {
    vi.stubEnv("FAL_KEY", "test-not-a-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", {status:503})); vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(cartoonFalClient().queue.submit("fal-ai/kling-video/o3/pro/reference-to-video", {input:{prompt:"test"}})).rejects.toThrow(/rejected/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  function harness() {
    const files = new Map<string, Buffer>();
    const client = { queue: { submit: vi.fn().mockResolvedValue({ request_id: "request-1" }), status: vi.fn().mockResolvedValue({ status: "COMPLETED" }), result: vi.fn().mockResolvedValue({ data: { video: { url: "https://fal.media/video.mp4" } } }), cancel: vi.fn().mockResolvedValue({}) } };
    const options = { client: client as unknown as FalClient, store: { load: async (name: string) => files.get(name) || null, save: async (name: string, value: unknown) => { files.set(name, Buffer.from(JSON.stringify(value))); } }, name: "scene", endpoint: "fal/model", input: { prompt: "hi" }, signal: new AbortController().signal, checkpoint: vi.fn().mockResolvedValue(undefined), pause: vi.fn().mockResolvedValue(undefined) };
    return { files, client, options };
  }
  it("persists and reuses results without paying twice", async () => {
    const { client, options, files } = harness();
    const first = await runFalStage(options); expect(await runFalStage(options)).toEqual(first);
    expect(client.queue.submit).toHaveBeenCalledTimes(1);
    expect(files.has("scene-request.json")).toBe(true);
  });
  it("recovers a saved provider request without resubmitting", async () => {
    const { client, options, files } = harness(); files.set("scene-request.json", Buffer.from(JSON.stringify({ endpoint: "fal/model", requestId: "existing" })));
    await runFalStage(options); expect(client.queue.submit).not.toHaveBeenCalled(); expect(client.queue.status.mock.calls[0][1].requestId).toBe("existing");
  });
  it("fails closed after an ambiguous submission", async () => {
    const { client, options, files } = harness(); files.set("scene-intent.json", Buffer.from("{}"));
    await expect(runFalStage(options)).rejects.toThrow(/No automatic duplicate/); expect(client.queue.submit).not.toHaveBeenCalled();
  });
  it("does not submit after cancellation; cancels an already submitted provider request", async () => {
    const { client, options } = harness(); options.checkpoint.mockRejectedValue(new Error("cancelled"));
    await expect(runFalStage(options)).rejects.toThrow(); expect(client.queue.submit).not.toHaveBeenCalled();
    const running = harness(); running.client.queue.status.mockRejectedValue(new Error("secret provider response"));
    await expect(runFalStage(running.options)).rejects.not.toThrow(/secret provider/); expect(running.client.queue.cancel).toHaveBeenCalledTimes(1);
  });
});
