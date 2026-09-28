import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), project: vi.fn(), job: vi.fn(), trigger: vi.fn(), saved: vi.fn(), update: vi.fn(), remove: vi.fn(), diagnostic: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@/lib/jobs/diagnostics", () => ({ recordDispatchFailure: mocks.diagnostic }));
import { createPresenterUpload, savePresenter, createPresenterProject, startPresenterJob, revokePresenter } from "@/app/studio/presenter/actions";
const id = "10000000-0000-4000-8000-000000000001", jobId = "20000000-0000-4000-8000-000000000001";
const brief = { title: "Introduction", script: "Welcome to my studio. Let us make something wonderful today.", duration: 15, resolution: "480p", aspectRatio: "9:16", captions: true, model: "fabric-1.0" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY", "test-only");
  const write = { eq: () => write, in: () => write, is: () => write, select: () => write, maybeSingle: mocks.saved };
  mocks.update.mockReturnValue(write);
  const project = { select: () => project, eq: () => project, single: mocks.project };
  const job = { select: () => job, eq: () => job, single: mocks.job };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, workspaceId: "workspace", db: { from: (name: string) => name === "generations" ? job : project }, admin: { rpc: mocks.rpc, from: () => ({ update: mocks.update }), storage: { from: () => ({ remove: mocks.remove }) } } });
  mocks.project.mockResolvedValue({ data: { brief } });
  mocks.rpc.mockResolvedValue({ data: jobId, error: null });
  mocks.job.mockResolvedValue({ data: { status: "reserved", provider_request_id: null, cancel_requested_at: null } });
  mocks.trigger.mockResolvedValue({ id: "run_test" }); mocks.saved.mockResolvedValue({ data: { id: jobId }, error: null });
  mocks.diagnostic.mockResolvedValue("Dispatch is uncertain."); mocks.remove.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("presenter authenticated actions", () => {
  it("authenticates every mutation independently", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    for (const result of [await createPresenterUpload({ mime: "image/png", size: 100 }), await savePresenter({ name: "Me", assetId: id, consent: true, adult: true }), await createPresenterProject({ requestId: id, presenterId: id, brief, approved: true }), await startPresenterJob(id), await revokePresenter(id)]) expect(result.error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("rejects unapproved scripts and absent ownership before reservation", async () => {
    expect((await createPresenterProject({ requestId: id, presenterId: id, brief, approved: false })).error).toBeTruthy();
    mocks.project.mockResolvedValue({ data: null });
    expect((await startPresenterJob(id)).error).toContain("not found"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("binds reservation to the signed-in owner and stable provider idempotency key", async () => {
    expect(await startPresenterJob(id)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("start_presenter_job", expect.objectContaining({ project_id: id, owner_id: "owner" }));
    expect(mocks.trigger).toHaveBeenCalledWith("presenter-pipeline", { generationId: jobId }, expect.objectContaining({ idempotencyKey: jobId, concurrencyKey: "owner" }), { retry: { maxAttempts: 1 } });
  });
  it("reconnects uncertain dispatch with the same job and does not redispatch an attached run", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("private provider response"));
    expect((await startPresenterJob(id)).error).not.toContain("private provider response");
    expect(await startPresenterJob(id)).toEqual({ ok: true });
    expect(mocks.trigger.mock.calls.every(call => call[2].idempotencyKey === jobId)).toBe(true);
    mocks.job.mockResolvedValue({ data: { status: "processing", provider_request_id: "run_existing" } });
    await startPresenterJob(id); expect(mocks.trigger).toHaveBeenCalledTimes(2);
  });
  it("does not dispatch cancellation requests or overwrite a cancellation race", async () => {
    mocks.job.mockResolvedValueOnce({ data: { status: "reserved", cancel_requested_at: "now" } });
    expect((await startPresenterJob(id)).error).toContain("Cancellation"); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.saved.mockResolvedValue({ data: null });
    expect((await startPresenterJob(id)).error).toContain("state changed");
  });
  it("revokes consent before removing the portrait and exposes deletion failure for retry", async () => {
    mocks.rpc.mockResolvedValue({ data: "workspace/owner/presenter-inputs/photo.png", error: null });
    mocks.remove.mockResolvedValue({ error: new Error("storage offline") });
    expect((await revokePresenter(id)).error).toContain("Consent revoked");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_presenter", { avatar_id: id, owner_id: "owner" });
  });
});
