import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), rpc: vi.fn(), project: vi.fn(), job: vi.fn(), saved: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
import { startShortsJob, saveShortsPlan, createShortsProject, createShortsUpload } from "@/app/studio/shorts/actions";
import { shortsDemo } from "@/lib/shorts/demo";
const id = "10000000-0000-4000-8000-000000000001", jobId = "20000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY", "test-only"); vi.spyOn(console, "error").mockImplementation(() => {});
  const response = Promise.resolve({ error: null });
  const write = { eq: () => write, in: () => write, is: () => write, select: () => write, maybeSingle: mocks.saved, then: response.then.bind(response) };
  mocks.update.mockReturnValue(write);
  const project = { select: () => project, eq: () => project, maybeSingle: mocks.project };
  const job = { select: () => job, eq: () => job, single: mocks.job };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, db: { from: (name: string) => name === "generations" ? job : project }, admin: { rpc: mocks.rpc, from: () => ({ update: mocks.update }) } });
  mocks.project.mockResolvedValue({ data: { plan: shortsDemo.plan, analysis: shortsDemo.analysis } });
  mocks.rpc.mockResolvedValue({ data: jobId, error: null });
  mocks.job.mockResolvedValue({ data: { status: "reserved", provider_request_id: null, cancel_requested_at: null } });
  mocks.trigger.mockResolvedValue({ id: "run_test" }); mocks.saved.mockResolvedValue({ data: { id: jobId }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("Shorts authenticated mutations", () => {
  it("authenticates every mutation independently", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    expect((await createShortsUpload({ mime: "video/mp4", size: 10 })).error).toContain("sign in");
    expect((await createShortsProject(shortsDemo.brief)).error).toContain("sign in");
    expect((await saveShortsPlan(id, 0, shortsDemo.plan)).error).toContain("sign in");
    expect((await startShortsJob(id, "analyze", 0)).error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("reserves only an owned project and distinct saved clips", async () => {
    expect((await startShortsJob(id, "render", 0, ["clip-1", "clip-1"])).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.project.mockResolvedValueOnce({ data: null });
    expect((await startShortsJob(id, "analyze", 0)).error).toContain("not found");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await startShortsJob(id, "render", 4, ["clip-2"])).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("start_shorts_job", expect.objectContaining({ owner_id: "owner", project_id: id, expected_revision: 4, clip_ids: ["clip-2"], job_kind: "render" }));
    expect(mocks.trigger).toHaveBeenCalledWith("shorts-pipeline", { generationId: jobId }, expect.objectContaining({ idempotencyKey: jobId }), { retry: { maxAttempts: 1 } });
  });
  it("does not dispatch cancelled jobs or report success over a cancellation race", async () => {
    mocks.job.mockResolvedValueOnce({ data: { status: "reserved", cancel_requested_at: "now" } });
    expect((await startShortsJob(id, "analyze", 0)).error).toContain("Cancellation"); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.saved.mockResolvedValueOnce({ data: null });
    expect((await startShortsJob(id, "analyze", 0)).error).toContain("state changed");
  });
  it("reconnects uncertain submissions with the same idempotency key", async () => {
    mocks.trigger.mockRejectedValueOnce({ status: 503, message: "private-provider-body" });
    const result = await startShortsJob(id, "analyze", 0);
    expect(result.error).toContain("credits remain reserved"); expect(result.error).not.toContain("private-provider-body");
    expect(await startShortsJob(id, "analyze", 0)).toEqual({ ok: true });
    expect(mocks.trigger.mock.calls.every((call) => call[2].idempotencyKey === jobId)).toBe(true);
  });
  it("requires valid transcript-bound edits and the revision before saving", async () => {
    expect((await saveShortsPlan(id, 0, { ...shortsDemo.plan, captionEdits: { "9999": "changed" } })).error).toContain("caption");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await saveShortsPlan(id, 3, shortsDemo.plan)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("save_shorts_plan", expect.objectContaining({ expected_revision: 3, owner_id: "owner" }));
  });
});
