import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), trigger: vi.fn(), rpc: vi.fn(), project: vi.fn(), read: vi.fn(), saved: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: mocks.trigger } }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: Error) => error.message }));
import { startCartoonJob, saveCartoonStory } from "@/app/studio/cartoons/actions";
import { cartoonDemo } from "@/lib/cartoons/demo";
const projectId = "10000000-0000-4000-8000-000000000001", jobId = "20000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY", "private-test-key"); vi.stubEnv("CARTOON_SEEDANCE_ENABLED", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = Promise.resolve({ error: null });
  const write = { eq: () => write, in: () => write, is: () => write, select: () => write, maybeSingle: mocks.saved, then: response.then.bind(response) };
  mocks.update.mockReturnValue(write);
  const project = { select: () => project, eq: () => project, single: mocks.project };
  const generation = { select: () => generation, eq: () => generation, single: mocks.read };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, db: { from: (name: string) => name === "generations" ? generation : project }, admin: { rpc: mocks.rpc, from: () => ({ update: mocks.update }) } });
  mocks.project.mockResolvedValue({ data: { brief: cartoonDemo.brief, storyboard: cartoonDemo.storyboard } });
  mocks.rpc.mockResolvedValue({ data: jobId, error: null });
  mocks.read.mockResolvedValue({ data: { status: "reserved", provider_request_id: null, cancel_requested_at: null }, error: null });
  mocks.trigger.mockResolvedValue({ id: "run_test" }); mocks.saved.mockResolvedValue({ data: { id: jobId }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("cartoon server actions", () => {
  it("authenticates inside every mutation", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    expect((await startCartoonJob(projectId, "render")).error).toContain("sign in");
    expect((await saveCartoonStory(projectId, cartoonDemo.storyboard)).error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("refuses a project the authenticated account cannot read", async () => {
    mocks.project.mockResolvedValue({ data: null });
    expect((await startCartoonJob(projectId, "render")).error).toContain("not found"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reconnects uncertain dispatch using the same durable key without refunds", async () => {
    mocks.trigger.mockRejectedValueOnce({ status: 401, message: "private-test-key" });
    const result = await startCartoonJob(projectId, "render");
    expect(result.error).toContain("credits remain reserved"); expect(result.error).not.toContain("private-test-key");
    expect(await startCartoonJob(projectId, "render")).toEqual({ ok: true });
    for (const call of mocks.trigger.mock.calls) expect(call).toEqual(["cartoon-pipeline", { generationId: jobId }, expect.objectContaining({ idempotencyKey: jobId }), { retry: { maxAttempts: 1 } }]);
    for (const call of mocks.rpc.mock.calls) expect(call[0]).toBe("start_cartoon_job");
  });
  it("does not dispatch a cancelling job or claim a cancellation race succeeded", async () => {
    mocks.read.mockResolvedValueOnce({ data: { status: "reserved", cancel_requested_at: "2026-09-24" } });
    expect((await startCartoonJob(projectId, "render")).error).toContain("Cancellation"); expect(mocks.trigger).not.toHaveBeenCalled();
    mocks.saved.mockResolvedValue({ data: null, error: null });
    expect((await startCartoonJob(projectId, "render")).error).toContain("state changed");
  });
  it.each(["seedance-2.5", "seedance-2.5-t2v"])("requires owner opt-in for %s, without silently falling back", async (model) => {
    mocks.project.mockResolvedValue({ data: { brief: { ...cartoonDemo.brief, model }, storyboard: cartoonDemo.storyboard } });
    expect((await startCartoonJob(projectId, "render")).error).toContain("Seedance access"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("cannot alter approved cast references or render excessive dialogue", async () => {
    const story = structuredClone(cartoonDemo.storyboard!); story.characters[0].referenceSlot = 1;
    expect((await saveCartoonStory(projectId, story)).error).toContain("reference");
    story.characters[0].referenceSlot = 0; story.characters[0].appearance = "A completely different cartoon character";
    expect((await saveCartoonStory(projectId, story)).error).toContain("cast is locked"); expect(mocks.update).not.toHaveBeenCalled();
    story.scenes[0].dialogue[0].text = "word ".repeat(15);
    mocks.project.mockResolvedValue({ data: { brief: cartoonDemo.brief, storyboard: story } });
    expect((await startCartoonJob(projectId, "render")).error).toContain("Shorten dialogue"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
