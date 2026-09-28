import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ job: vi.fn(), consent: vi.fn(), rpc: vi.fn(), upload: vi.fn(), load: vi.fn(), loadFile: vi.fn(), saveFile: vi.fn(), signed: vi.fn(), exec: vi.fn(), provider: vi.fn(), active: vi.fn(), claim: vi.fn(), cancelled: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ schemaTask: (config: unknown) => config, metadata: { set: vi.fn() }, wait: { for: vi.fn() } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => {
  const chain = { select: () => chain, eq: () => chain, is: () => chain, single: mocks.job, maybeSingle: mocks.consent };
  return { rpc: mocks.rpc, from: () => ({ ...chain, update: () => ({ eq: async () => ({ error: null }) }) }), storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) } };
} }));
vi.mock("../trigger/job-control", () => ({ assertJobActive: mocks.active, claimJob: mocks.claim, finishCancelledJob: mocks.cancelled }));
vi.mock("../trigger/media-io", () => ({ MEDIA_LIMITS: { json: 1000000, voice: 1000000, image: 1000000, video: 1000000 }, readBoundedBody: vi.fn(), artifactStore: () => ({ load: mocks.load, loadFile: mocks.loadFile, saveFile: mocks.saveFile }) }));
vi.mock("../trigger/cartoon-fal", () => ({ cartoonFalClient: () => ({}), runFalStage: mocks.provider }));
vi.mock("../trigger/cartoon-media", () => ({ downloadCartoonVideo: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: mocks.exec }) }));
import { presenterPipeline } from "../trigger/presenter-pipeline";
const id = "10000000-0000-4000-8000-000000000001";
const brief = { title: "Introduction", script: "Welcome to my studio. Let us make something wonderful today.", duration: 15, resolution: "480p", aspectRatio: "9:16", captions: true, model: "fabric-1.0" };
const task = presenterPipeline as unknown as {
  run: (payload: { generationId: string }, context: unknown) => Promise<unknown>;
  onComplete: (args: unknown) => Promise<void>; onCancel: (args: unknown) => Promise<void>;
};
const run = () => task.run({ generationId: id }, { signal: new AbortController().signal, ctx: { run: { id: "run_test" }, attempt: { number: 1 } } });
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_DEFAULT_VOICE_ID"]) vi.stubEnv(key, "test-only");
  mocks.job.mockResolvedValue({ data: { operation: "presenter-render", workspace_id: "workspace", requested_by: "owner", settings: { presenterId: id, portraitPath: "workspace/owner/presenter-inputs/photo.png", consentVersion: "photo-presenter-v1", brief } } });
  mocks.consent.mockResolvedValue({ data: { id } }); mocks.rpc.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null }); mocks.signed.mockResolvedValue({ data: { signedUrl: "https://test.supabase.co/private-media" } });
  mocks.load.mockImplementation(async (name: string) => name === "voice.json" ? Buffer.from(JSON.stringify({ audio_base64: "dGVzdA==", alignment: { characters: ["H", "i"], character_start_times_seconds: [0, .1], character_end_times_seconds: [.1, .2] } })) : null);
  mocks.loadFile.mockImplementation(async (name: string, file: string) => { if (name !== "photo.png") return false; await writeFile(file, Buffer.from("89504e470d0a1a0a0000000000000000", "hex")); return true; });
  mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 512, height: 640 }, { codec_type: "audio" }], format: { duration: "10" } }) });
  mocks.provider.mockResolvedValue({ video: { url: "https://fal.media/test.mp4" } });
});
afterEach(() => vi.unstubAllEnvs());
describe("presenter worker orchestration without paid calls", () => {
  it("reuses cached speech, checks consent and sends portrait/audio to the allowed fal model", async () => {
    expect(await run()).toEqual({ seconds: 10 });
    expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "veed/fabric-1.0", input: { image_url: "https://test.supabase.co/private-media", audio_url: "https://test.supabase.co/private-media", resolution: "480p" } }));
    expect(mocks.consent).toHaveBeenCalled(); expect(mocks.active).toHaveBeenCalled();
    expect(mocks.exec.mock.calls.some(([, args]) => args.join(" ").includes("subtitles=disclosure.srt"))).toBe(true);
    expect(mocks.saveFile.mock.calls.some(([name]) => name === "presenter.mp4")).toBe(true);
  });
  it("refuses revoked consent before touching a provider", async () => {
    mocks.consent.mockResolvedValue({ data: null });
    await expect(run()).rejects.toThrow("permission"); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("does not retry uncertain voice submissions", async () => {
    mocks.load.mockImplementation(async (name: string) => name === "voice-intent.json" ? Buffer.from("{}") : null);
    await expect(run()).rejects.toThrow("duplicate charge"); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects speech longer than reserved before purchasing animation", async () => {
    mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 512, height: 640 }], format: { duration: "16" } }) });
    await expect(run()).rejects.toThrow("selected maximum"); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("settles actual duration and releases failed jobs through the database", async () => {
    await task.onComplete({ payload: { generationId: id }, result: { ok: true, data: { seconds: 10.1 } } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_presenter_job", { job_id: id, succeeded: true, result_seconds: 10.1 });
    await task.onComplete({ payload: { generationId: id }, result: { ok: false } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_presenter_job", { job_id: id, succeeded: false, result_seconds: null });
    mocks.rpc.mockResolvedValue({ error: {} });
    await expect(task.onComplete({ payload: { generationId: id }, result: { ok: false } })).rejects.toThrow("settlement failed");
  });
  it("delegates cancellation to the shared stop-and-refund handler", async () => {
    const runPromise = Promise.resolve(); await task.onCancel({ payload: { generationId: id }, runPromise });
    expect(mocks.cancelled).toHaveBeenCalledWith(expect.anything(), id, runPromise);
  });
});
