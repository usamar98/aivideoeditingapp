import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remakeBrief } from "./fixtures/ad-remake";
const mocks = vi.hoisted(() => ({ job: vi.fn(), rpc: vi.fn(), upload: vi.fn(), load: vi.fn(), loadFile: vi.fn(), saveFile: vi.fn(), signed: vi.fn(), exec: vi.fn(), provider: vi.fn(), client: vi.fn(), active: vi.fn(), claim: vi.fn(), cancelled: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ schemaTask: (config: unknown) => config, metadata: { set: vi.fn() }, wait: { for: vi.fn() } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => { const chain = { select: () => chain, eq: () => chain, single: mocks.job }; return { rpc: mocks.rpc, from: () => ({ ...chain, update: () => ({ eq: async () => ({ error: null }) }) }), storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) } }; } }));
vi.mock("../trigger/job-control", () => ({ assertJobActive: mocks.active, claimJob: mocks.claim, finishCancelledJob: mocks.cancelled }));
vi.mock("../trigger/media-io", () => ({ MEDIA_LIMITS: { json: 1000000, image: 20000000, video: 100000000 }, artifactStore: () => ({ load: mocks.load, loadFile: mocks.loadFile, saveFile: mocks.saveFile }) }));
vi.mock("../trigger/cartoon-fal", () => ({ cartoonFalClient: mocks.client, runFalStage: mocks.provider }));
vi.mock("../trigger/cartoon-media", () => ({ downloadCartoonVideo: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: mocks.exec }) }));
import { adRemakePipeline } from "../trigger/ad-remake-pipeline";
const id = "10000000-0000-4000-8000-000000000003";
const task = adRemakePipeline as unknown as { run: (p: {generationId: string}, c: unknown) => Promise<unknown>; onComplete: (a: unknown) => Promise<void>; onCancel: (a: unknown) => Promise<void> };
const run = () => task.run({ generationId: id }, { signal: new AbortController().signal, ctx: { run: { id: "run_test" }, attempt: { number: 1 } } });
const job = (brief = remakeBrief, sourcePath = "workspace/owner/ad-remake-inputs/source.mp4") => ({ data: { operation: "ad-remake-render", workspace_id: "workspace", requested_by: "owner", settings: { brief, sourcePath, imagePaths: ["workspace/owner/ad-remake-inputs/product.png"] } } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "test"); vi.stubEnv("SUPABASE_SECRET_KEY", "test");
  mocks.job.mockResolvedValue(job()); mocks.rpc.mockResolvedValue({ error: null }); mocks.upload.mockResolvedValue({ error: null }); mocks.load.mockResolvedValue(null);
  mocks.client.mockReturnValue({}); mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/input" } });
  mocks.loadFile.mockImplementation(async (name: string, file: string) => { if (!["source.mp4", "product.png"].includes(name)) return false; await writeFile(file, Buffer.from("89504e470d0a1a0a0000000000000000", "hex")); return true; });
  mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 720, height: 1280 }, { codec_type: "audio" }], format: { duration: "5" } }) });
  mocks.provider.mockResolvedValue({ video: { url: "https://fal.media/video.mp4" } });
});
afterEach(() => vi.unstubAllEnvs());
describe("Ad Remake worker orchestration without paid inference", () => {
  it("binds reference and product assets to one edit request and saves a silent export", async () => {
    expect(await run()).toEqual({ seconds: 5 }); expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "fal-ai/kling-video/o3/standard/video-to-video/edit", input: expect.objectContaining({ keep_audio: false, video_url: "https://example.supabase.co/input", elements: [{ frontal_image_url: "https://example.supabase.co/input" }] }) }));
    expect(mocks.exec.mock.calls.some(([, args]) => args.join(" ").includes("AI-edited ad") && args.includes("-an"))).toBe(true);
    expect(mocks.saveFile.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(["reference.mp4", "product-0.png", "edited.mp4", "remake.mp4"]));
  });
  it("rejects missing/foreign input and duration spoofing before paid work", async () => {
    mocks.job.mockResolvedValue(job(remakeBrief, "other/owner/ad-remake-inputs/source.mp4")); await expect(run()).rejects.toThrow(/ownership/);
    mocks.job.mockResolvedValue(job()); mocks.loadFile.mockResolvedValue(false); await expect(run()).rejects.toThrow(/missing/); expect(mocks.provider).not.toHaveBeenCalled();
    mocks.loadFile.mockResolvedValue(true); mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 720, height: 1280 }], format: { duration: "180" } }) });
    await expect(run()).rejects.toThrow(/3–15/); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("resumes saved provider footage without a second edit request", async () => {
    const source = mocks.loadFile.getMockImplementation()!; mocks.loadFile.mockImplementation(async (name: string, file: string) => name === "edited.mp4" ? true : source(name, file));
    expect(await run()).toEqual({ seconds: 5 }); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each(["2", "NaN"])("rejects invalid model output duration %s without committing the export", async duration => {
    mocks.exec.mockImplementation(async (_cmd: string, args: string[]) => ({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 720, height: 1280 }], format: { duration: args.at(-1) === "edited.mp4" ? duration : "5" } }) }));
    await expect(run()).rejects.toThrow(/incomplete/); expect(mocks.saveFile.mock.calls.map(c => c[0])).not.toContain("remake.mp4");
  });
  it("checks cancellation and delegates stop-before-refund settlement", async () => {
    mocks.active.mockRejectedValue(new Error("Cancelled")); await expect(run()).rejects.toThrow(/Cancelled/); expect(mocks.provider).not.toHaveBeenCalled();
    await task.onComplete({ payload: { generationId: id }, result: { ok: true, data: { seconds: 5 } } }); expect(mocks.rpc).toHaveBeenLastCalledWith("finish_ad_remake_job", { job_id: id, succeeded: true, result_seconds: 5 });
    await task.onComplete({ payload: { generationId: id }, result: { ok: false } }); expect(mocks.rpc).toHaveBeenLastCalledWith("finish_ad_remake_job", { job_id: id, succeeded: false, result_seconds: null });
    const runPromise = Promise.resolve(); await task.onCancel({ payload: { generationId: id }, runPromise }); expect(mocks.cancelled).toHaveBeenCalledWith(expect.anything(), id, runPromise);
  });
});
