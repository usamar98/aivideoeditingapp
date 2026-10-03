import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cartoonDemo } from "@/lib/cartoons/demo";
import type { CartoonModel } from "@/lib/cartoons/schema";
import { filmDemo } from "@/lib/films/demo";
import { filmModelIds, filmModels } from "@/lib/films/models";
import { longFilmStory } from "./fixtures/long-film";

const mocks = vi.hoisted(() => ({
  job: vi.fn(), upload: vi.fn(), load: vi.fn(), provider: vi.fn(),
  signed: vi.fn(), image: vi.fn(), clip: vi.fn(), planner: vi.fn(), exec: vi.fn(), loadFile: vi.fn(), saveFile: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: unknown) => config, metadata: { set: vi.fn() }, logger: { info: vi.fn(), error: vi.fn() },
  wait: { for: vi.fn() }, AbortTaskRunError: class extends Error {},
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => {
  const chain = { select: () => chain, eq: () => chain, single: mocks.job };
  return { from: () => ({ ...chain, update: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) } };
} }));
vi.mock("../trigger/job-control", () => ({ assertJobActive: vi.fn(), claimJob: vi.fn(), finishCancelledJob: vi.fn() }));
vi.mock("../trigger/media-io", () => ({
  MEDIA_LIMITS: { json: 1000000, image: 1000000, video: 1000000 }, readBoundedBody: vi.fn(),
  artifactStore: () => ({ load: mocks.load, loadFile: mocks.loadFile, saveFile: mocks.saveFile }),
  downloadProviderImage: mocks.image,
}));
vi.mock("../trigger/cartoon-fal", () => ({ cartoonFalClient: () => ({}), runFalStage: mocks.provider, CartoonProviderError: class extends Error {} }));
vi.mock("../trigger/cartoon-planner", () => ({ CARTOON_PLANNER_MODEL: "planner", runCartoonPlanner: mocks.planner, CartoonPlannerError: class extends Error {} }));
vi.mock("../trigger/cartoon-media", async (importOriginal) => ({
  ...await importOriginal<typeof import("../trigger/cartoon-media")>(), downloadCartoonVideo: mocks.clip,
}));
vi.mock("node:child_process", () => {
  const execFile = Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: mocks.exec });
  return { execFile };
});
import { cartoonPipeline } from "../trigger/cartoon-pipeline";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  mocks.upload.mockResolvedValue({ error: null });
  mocks.load.mockResolvedValue(null);
  mocks.loadFile.mockResolvedValue(false);
  mocks.planner.mockResolvedValue(JSON.stringify(cartoonDemo.storyboard));
  mocks.provider.mockResolvedValue({ video: { url: "https://fal.media/example.mp4" } });
  mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video" }, { codec_type: "audio" }], format: { duration: "5" } }) });
});
afterEach(() => vi.unstubAllEnvs());

// Exercise the real worker orchestration with isolated fake services; no API spend.
async function run(kind: "plan" | "render", model: CartoonModel, audio = true) {
  const brief = { ...cartoonDemo.brief, model, audio };
  const generationId = "10000000-0000-4000-8000-000000000001";
  mocks.job.mockResolvedValue({ data: {
    operation: `cartoon-${kind}`, workspace_id: "workspace", requested_by: "owner",
    settings: { projectId: generationId, kind, brief, storyboard: kind === "render" ? cartoonDemo.storyboard : null, castPaths: {} },
  } });
  const task = cartoonPipeline as unknown as { run: (payload: { generationId: string }, context: unknown) => Promise<unknown> };
  return task.run({ generationId }, { signal: new AbortController().signal, ctx: { run: { id: "run_test" }, attempt: { number: 1 } } });
}

describe("direct cartoon worker", () => {
  it.each(["minimax-h3-turbo", "seedance-2.5-t2v", "kling-v3"] as const)("plans %s without generating or downloading portraits", async (model) => {
    expect(await run("plan", model)).toMatchObject({ storyboard: cartoonDemo.storyboard, castPaths: {}, outputPath: null });
    expect(mocks.planner).toHaveBeenCalledTimes(1);
    expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.image).not.toHaveBeenCalled(); expect(mocks.signed).not.toHaveBeenCalled();
  });
  it.each(["minimax-h3-turbo", "seedance-2.5-t2v", "kling-v3"] as const)("renders %s directly from text, without frame-image jobs", async (model) => {
    expect(await run("render", model)).toMatchObject({ outputPath: expect.stringContaining("/video.mp4") });
    expect(mocks.provider).toHaveBeenCalledTimes(3); expect(mocks.clip).toHaveBeenCalledTimes(3);
    for (const [request] of mocks.provider.mock.calls) {
      expect(request.endpoint).toContain("/text-to-video");
      expect(request.input).not.toHaveProperty("image_urls");
      expect(request.input).not.toHaveProperty("start_image_url");
    }
    expect(mocks.image).not.toHaveBeenCalled(); expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("accepts silent Kling output but refuses missing audio on an audio-enabled film", async () => {
    mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "5" } }) });
    await expect(run("render", "kling-v3", false)).resolves.toBeDefined();
    expect(mocks.exec.mock.calls.some(([, args]) => args.includes("anullsrc=r=48000:cl=stereo"))).toBe(true);
    await expect(run("render", "kling-v3", true)).rejects.toThrow("missing audio");
  });
});

describe("short film worker", () => {
  function setupLongFilm(finalSeconds = 180, audioSeconds = 180) {
    const generationId = "10000000-0000-4000-8000-000000000001", story = longFilmStory();
    mocks.job.mockResolvedValue({ data: { operation: "cartoon-render", workspace_id: "workspace", requested_by: "owner",
      settings: { projectId: generationId, kind: "render", brief: { ...filmDemo.brief, duration: 180 }, storyboard: story, castPaths: { c1: "workspace/owner/cartoons/previous/cast-c1.png" } } } });
    mocks.signed.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://test.supabase.co/${path}` }, error: null }));
    mocks.provider.mockImplementation(async ({ name }) => name.startsWith("frame-") ? { images: [{ url: "https://fal.media/frame.png" }] } : { video: { url: "https://fal.media/clip.mp4" } });
    mocks.exec.mockImplementation(async (_command: string, args: string[]) => {
      const last = args.at(-1)!, index = Number(last.match(/^raw-(\d+)/)?.[1] ?? 0);
      const seconds = last === "video.mp4" ? finalSeconds : story.scenes[index].duration;
      return { stdout: JSON.stringify({ streams: [{ codec_type: "video", duration: String(seconds) }, { codec_type: "audio", duration: String(last === "video.mp4" ? audioSeconds : seconds) }], format: { duration: String(seconds) } }) };
    });
    const task = cartoonPipeline as unknown as { run: (payload: { generationId: string }, context: unknown) => Promise<unknown> };
    return { story, run: () => task.run({ generationId }, { signal: new AbortController().signal, ctx: { run: { id: "film_long_test" }, attempt: { number: 1 } } }) };
  }
  it("renders all 23 shots, preserving reference order, state, exact duration and full-quality export allowance", async () => {
    const h = setupLongFilm();
    await expect(h.run()).resolves.toHaveProperty("outputPath");
    const images = mocks.provider.mock.calls.map(([r]) => r).filter(r => r.name.startsWith("frame-"));
    const videos = mocks.provider.mock.calls.map(([r]) => r).filter(r => r.name.startsWith("video-"));
    expect(images).toHaveLength(23); expect(videos).toHaveLength(23);
    expect(videos.reduce((s, r) => s + Number(r.input.duration), 0)).toBe(180);
    expect(images[8].input.image_urls).toEqual([
      expect.stringContaining("/previous/cast-c1.png"), expect.stringContaining("/frame-0.png"), expect.stringContaining("/tail-7.png"),
    ]);
    expect(images[22].input.image_urls).toHaveLength(1); // New location; no misleading scene reference.
    expect(videos[8].input.elements).toHaveLength(1); // World frames must never become character elements.
    expect(images[8].input.prompt).toContain(h.story.scenes[8].continuity!.stateIn);
    expect(mocks.saveFile).toHaveBeenCalledWith("video.mp4", expect.any(String), "video/mp4", 400 * 1024 * 1024);
    expect(mocks.exec.mock.calls.filter(([, args]) => args.includes("concat"))).toHaveLength(1);
  });
  it("rebuilds a missing tail on retry without regenerating the saved shot", async () => {
    const h = setupLongFilm();
    mocks.loadFile.mockImplementation(async (name: string) => name === "clip-0.mp4");
    await h.run();
    expect(mocks.provider.mock.calls.some(([r]) => ["frame-0", "video-0"].includes(r.name))).toBe(false);
    expect(mocks.saveFile).toHaveBeenCalledWith("tail-0.png", expect.any(String), "image/png", expect.any(Number));
  });
  it.each([[48, 48], [180, 24]])("rejects a truncated final export (%ss video, %ss audio)", async (video, audio) => {
    const h = setupLongFilm(video, audio);
    await expect(h.run()).rejects.toThrow(/truncated/);
    expect(mocks.saveFile.mock.calls.some(([name]) => name === "video.mp4")).toBe(false);
    expect(mocks.upload.mock.calls.some(([name]) => name.endsWith("result.json"))).toBe(false);
  });
  it("rejects broken continuity before any provider call", async () => {
    const h = setupLongFilm(); h.story.scenes[1].continuity!.stateIn = "The story has reset unexpectedly.";
    await expect(h.run()).rejects.toThrow(/preceding shot/);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("does not stretch an incomplete seven-second source to fill an eight-second film shot", async () => {
    const h = setupLongFilm();
    mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video" }, { codec_type: "audio" }], format: { duration: "7" } }) });
    await expect(h.run()).rejects.toThrow(/incomplete clip/);
    expect(mocks.exec.mock.calls.some(([, args]) => args.includes("concat"))).toBe(false);
  });
  it.each(filmModelIds)("renders %s with three reference-guided shots and one final export", async (model) => {
    const generationId = "10000000-0000-4000-8000-000000000001";
    const audio = model !== "film-minimax-h3-turbo";
    const story = structuredClone(filmDemo.storyboard!);
    if (!audio) story.scenes.forEach(scene => { scene.dialogue = []; });
    mocks.job.mockResolvedValue({ data: { operation: "cartoon-render", workspace_id: "workspace", requested_by: "owner",
      settings: { projectId: generationId, kind: "render", brief: { ...filmDemo.brief, model, resolution: filmModels[model].defaultResolution, audio }, storyboard: story, castPaths: { c1: "workspace/owner/cartoons/previous/cast-c1.png" } } } });
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://test.supabase.co/private/image.png" }, error: null });
    mocks.provider.mockImplementation(async ({ name }) => name.startsWith("frame-") ? { images: [{ url: "https://fal.media/frame.png" }] } : { video: { url: "https://fal.media/clip.mp4" } });
    mocks.exec.mockImplementation(async (_command, args) => { const seconds = args.at(-1) === "video.mp4" ? "24" : "8"; return { stdout: JSON.stringify({ streams: [{ codec_type: "video", duration: seconds }, { codec_type: "audio", duration: seconds }], format: { duration: seconds } }) }; });
    const task = cartoonPipeline as unknown as { run: (payload: { generationId: string }, context: unknown) => Promise<unknown> };
    await expect(task.run({ generationId }, { signal: new AbortController().signal, ctx: { run: { id: "film_test" }, attempt: { number: 1 } } })).resolves.toMatchObject({ outputPath: `workspace/owner/cartoons/${generationId}/video.mp4` });
    expect(mocks.provider).toHaveBeenCalledTimes(6);
    expect(mocks.image).toHaveBeenCalledTimes(3);
    expect(mocks.clip).toHaveBeenCalledTimes(3);
    const videoCalls = mocks.provider.mock.calls.filter(([request]) => request.name.startsWith("video-"));
    expect(videoCalls.every(([request]) => request.endpoint === filmModels[model].endpoint)).toBe(true);
    expect(mocks.exec.mock.calls.filter(([, args]) => args.includes("concat"))).toHaveLength(1);
    if (!audio) expect(mocks.exec.mock.calls.some(([, args]) => args.includes("anullsrc=r=48000:cl=stereo"))).toBe(true);
  });
});
