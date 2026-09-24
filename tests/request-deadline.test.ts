import { afterEach, describe, expect, it, vi } from "vitest";
import { withRequestDeadline } from "../trigger/request-deadline";
import { readBoundedBody } from "../trigger/media-io";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("scoped request deadlines", () => {
  it("removes the parent listener on success and failure", async () => {
    const parent = new AbortController(); const remove = vi.spyOn(parent.signal, "removeEventListener");
    expect(await withRequestDeadline(parent.signal, 1000, async () => "ok")).toBe("ok");
    await expect(withRequestDeadline(parent.signal, 1000, async () => { throw new Error("test"); })).rejects.toThrow("test"); expect(remove).toHaveBeenCalledTimes(2);
  });
  it("rejects an already-aborted parent before invoking the operation", async () => {
    const parent = new AbortController(); parent.abort(); const operation = vi.fn();
    await expect(withRequestDeadline(parent.signal, 1000, operation)).rejects.toThrow(); expect(operation).not.toHaveBeenCalled();
  });
  it("keeps the deadline active while reading the response body", async () => {
    const pending = withRequestDeadline(new AbortController().signal, 15, async (signal) => {
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } });
      return readBoundedBody(body, 1024, signal);
    });
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("clears the timer after an operation completes", async () => {
    vi.useFakeTimers(); await withRequestDeadline(new AbortController().signal, 1000, async () => "done"); expect(vi.getTimerCount()).toBe(0);
  });
});
