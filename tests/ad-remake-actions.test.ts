import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remakeBrief } from "./fixtures/ad-remake";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), project: vi.fn(), job: vi.fn(), trigger: vi.fn(), saved: vi.fn(), diagnostic: vi.fn(), assets: vi.fn(), info: vi.fn(), insert: vi.fn(), signed: vi.fn(), daily: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (e: Error) => e.message }));
vi.mock("@/lib/jobs/diagnostics", () => ({ recordDispatchFailure: mocks.diagnostic }));
import { createAdRemakeUpload, createAdRemakeProject, startAdRemakeJob } from "@/app/studio/ad-remake/actions";
const id = "10000000-0000-4000-8000-000000000003", jobId = "10000000-0000-4000-8000-000000000004";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY", "test");
  const write = { eq: () => write, in: () => write, is: () => write, select: () => write, maybeSingle: mocks.saved };
  const project = { select: () => project, eq: () => project, single: mocks.project }, job = { select: () => job, eq: () => job, single: mocks.job };
  const assets = { select: () => assets, eq: () => assets, is: () => assets, in: mocks.assets, gte: mocks.daily };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, workspaceId: "workspace", db: { from: (name: string) => name === "generations" ? job : name === "assets" ? assets : project }, admin: { rpc: mocks.rpc, from: () => ({ update: () => write, insert: mocks.insert }), storage: { from: () => ({ info: mocks.info, createSignedUploadUrl: mocks.signed }) } } });
  mocks.project.mockResolvedValue({ data: { brief: remakeBrief } }); mocks.rpc.mockResolvedValue({ data: jobId, error: null }); mocks.job.mockResolvedValue({ data: { status: "reserved", provider_request_id: null, cancel_requested_at: null } });
  mocks.assets.mockResolvedValue({ data: [remakeBrief.sourceAssetId, ...remakeBrief.productAssetIds].map(id => ({ id, storage_path: `workspace/owner/ad-remake-inputs/${id}.png`, byte_size: 100 })) });
  mocks.info.mockResolvedValue({ data: { size: 100 } }); mocks.insert.mockResolvedValue({ error: null }); mocks.daily.mockResolvedValue({ count: 0 }); mocks.signed.mockResolvedValue({ data: { token: "signed" } });
  mocks.trigger.mockResolvedValue({ id: "run_test" }); mocks.saved.mockResolvedValue({ data: { id: jobId }, error: null }); mocks.diagnostic.mockResolvedValue("Dispatch is uncertain.");
});
afterEach(() => vi.unstubAllEnvs());
describe("Ad Remake authenticated actions", () => {
  it("authenticates upload, save and render independently", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    for (const result of [await createAdRemakeUpload({ kind: "video", mime: "video/mp4", size: 100 }), await createAdRemakeProject(remakeBrief), await startAdRemakeJob(id, true)]) expect(result.error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("requires review approval and ownership before reserving", async () => {
    expect((await startAdRemakeJob(id, false)).error).toContain("Review"); mocks.project.mockResolvedValue({ data: null });
    expect((await startAdRemakeJob(id, true)).error).toContain("not found"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks completed private uploads before saving a free brief", async () => {
    expect(await createAdRemakeProject(remakeBrief)).toEqual({ id: expect.any(String) }); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.rpc.mockClear(); mocks.info.mockResolvedValue({ data: { size: 99 } }); expect((await createAdRemakeProject(remakeBrief)).error).toContain("not finished"); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.info.mockResolvedValue({ data: { size: 100 } }); mocks.assets.mockResolvedValue({ data: [] }); expect((await createAdRemakeProject(remakeBrief)).error).toContain("your account");
  });
  it("issues non-overwriting private signed uploads", async () => {
    const result = await createAdRemakeUpload({ kind: "video", mime: "video/mp4", size: 100 }); expect(result.path).toMatch(/^workspace\/owner\/ad-remake-inputs\/[\w-]+\.mp4$/);
    expect(mocks.signed).toHaveBeenCalledWith(result.path, { upsert: false });
  });
  it("dispatches the saved job idempotently and does not resend running work", async () => {
    expect(await startAdRemakeJob(id, true)).toEqual({ ok: true }); expect(mocks.rpc).toHaveBeenCalledWith("start_ad_remake_job", expect.objectContaining({ project_id: id, owner_id: "owner" }));
    expect(mocks.trigger).toHaveBeenCalledWith("ad-remake-pipeline", { generationId: jobId }, expect.objectContaining({ idempotencyKey: jobId, concurrencyKey: "owner" }), { retry: { maxAttempts: 1 } });
    mocks.job.mockResolvedValue({ data: { status: "processing", provider_request_id: "run_existing" } }); await startAdRemakeJob(id, true); expect(mocks.trigger).toHaveBeenCalledTimes(1);
  });
  it("preserves reservations on uncertain dispatch and stops cancellation races", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("secret response")); const result = await startAdRemakeJob(id, true); expect(result.error).toContain("credits remain reserved"); expect(result.error).not.toContain("secret response");
    expect(await startAdRemakeJob(id, true)).toEqual({ ok: true }); expect(mocks.trigger.mock.calls.every(c => c[2].idempotencyKey === jobId)).toBe(true);
    mocks.job.mockResolvedValue({ data: { status: "reserved", cancel_requested_at: "now" } }); expect((await startAdRemakeJob(id, true)).error).toContain("Cancellation"); expect(mocks.trigger).toHaveBeenCalledTimes(2);
  });
});
