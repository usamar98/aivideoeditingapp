import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), rpc: vi.fn(), project: vi.fn(), job: vi.fn(), saved: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: Error) => error.message }));
import { startUgcJob, saveUgcPlan, createUgcProject, createUgcUpload, importUgcProduct } from "@/app/studio/ugc/actions";
import { ugcDemo } from "@/lib/ugc/demo";
const id = "10000000-0000-4000-8000-000000000001", jobId = "20000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY", "not-a-secret"); vi.spyOn(console, "error").mockImplementation(() => {});
  const response = Promise.resolve({ error: null });
  const write = { eq: () => write, in: () => write, is: () => write, select: () => write, maybeSingle: mocks.saved, then: response.then.bind(response) };
  mocks.update.mockReturnValue(write);
  const project = { select: () => project, eq: () => project, single: mocks.project };
  const job = { select: () => job, eq: () => job, single: mocks.job };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, db: { from: (name: string) => name === "generations" ? job : project }, admin: { rpc: mocks.rpc, from: () => ({ update: mocks.update }) } });
  mocks.project.mockResolvedValue({ data: { brief: ugcDemo.brief, plan: ugcDemo.plan } });
  mocks.rpc.mockResolvedValue({ data: jobId, error: null });
  mocks.job.mockResolvedValue({ data: { status: "reserved", provider_request_id: null, cancel_requested_at: null } });
  mocks.trigger.mockResolvedValue({ id: "run_test" }); mocks.saved.mockResolvedValue({ data: { id: jobId }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("UGC authenticated mutations", () => {
  it("authenticates uploads, imports, projects, edits and generation independently", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    expect((await createUgcUpload({ mime: "image/png", size: 10 })).error).toContain("sign in");
    expect((await importUgcProduct("https://shop.example/product")).error).toContain("sign in");
    expect((await createUgcProject(ugcDemo.brief)).error).toContain("sign in");
    expect((await saveUgcPlan(id, 0, ugcDemo.plan)).error).toContain("sign in");
    expect((await startUgcJob(id, "plan", 0)).error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("requires approval and distinct selected hooks before reserving credits", async () => {
    expect((await startUgcJob(id, "render", 0, ["hook-1"], false)).error).toContain("approve");
    expect((await startUgcJob(id, "render", 0, ["hook-1", "hook-1"], true)).error).toContain("once");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("binds revision, selection and owner to the atomic reservation", async () => {
    expect(await startUgcJob(id, "render", 4, ["hook-2"], true)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("start_ugc_job", expect.objectContaining({ owner_id: "owner", project_id: id, expected_revision: 4, hook_ids: ["hook-2"], job_kind: "render" }));
    expect(mocks.trigger).toHaveBeenCalledWith("ugc-pipeline", { generationId: jobId }, expect.objectContaining({ idempotencyKey: jobId }), { retry: { maxAttempts: 1 } });
  });
  it("does not reserve for a missing or inaccessible project", async () => {
    mocks.project.mockResolvedValue({ data: null });
    expect((await startUgcJob(id, "plan", 0)).error).toContain("not found"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves uncertain submissions for reconnection without duplicate charging", async () => {
    mocks.trigger.mockRejectedValueOnce({ status: 503, message: "private-provider-body" });
    const first = await startUgcJob(id, "plan", 0);
    expect(first.error).toContain("credits remain reserved"); expect(first.error).not.toContain("private-provider-body");
    expect(await startUgcJob(id, "plan", 0)).toEqual({ ok: true });
    expect(mocks.trigger.mock.calls.every((call) => call[2].idempotencyKey === jobId)).toBe(true);
  });
  it("does not dispatch cancelling jobs or overwrite a cancellation race", async () => {
    mocks.job.mockResolvedValueOnce({ data: { status: "reserved", cancel_requested_at: "now" } });
    expect((await startUgcJob(id, "plan", 0)).error).toContain("Cancellation"); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.saved.mockResolvedValueOnce({ data: null });
    expect((await startUgcJob(id, "plan", 0)).error).toContain("state changed");
  });
});
