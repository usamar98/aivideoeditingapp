import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cartoonDemo } from "@/lib/cartoons/demo";
import type { CartoonModel } from "@/lib/cartoons/schema";

const mocks = vi.hoisted(() => ({
  job: vi.fn(), upload: vi.fn(), load: vi.fn(), provider: vi.fn(),
  signed: vi.fn(), image: vi.fn(), clip: vi.fn(), planner: vi.fn(), exec: vi.fn(),
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
  artifactStore: () => ({ load: mocks.load, loadFile: async () => false, saveFile: vi.fn() }),
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
