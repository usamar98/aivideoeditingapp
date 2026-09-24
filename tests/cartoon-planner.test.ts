import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { CARTOON_PLANNER_MODEL, plannerOutputText, runCartoonPlanner, type PlannerInput } from "../trigger/cartoon-planner";
import { withRequestDeadline } from "../trigger/request-deadline";
import { MEDIA_LIMITS, readBoundedBody } from "../trigger/media-io";

const output = JSON.stringify(cartoonDemo.storyboard);
const wireResponse = () => ({ id: "interaction-test", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: output }] }], usage: { total_tokens: 123 } });
function harness() {
  vi.stubEnv("GEMINI_API_KEY", "fake-key-never-sent-to-provider");
  const files = new Map<string, Buffer>();
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(wireResponse()));
  vi.stubGlobal("fetch", fetchMock);
  const store = {
    load: vi.fn(async (name: string) => files.get(name) || null),
    save: vi.fn(async (name: string, value: unknown) => { files.set(name, Buffer.from(JSON.stringify(value))); }),
  };
  const controller = new AbortController();
  const checkpoint = vi.fn(async () => { controller.signal.throwIfAborted(); });
  const input: PlannerInput = [{ type: "text", text: "private-user-prompt" }, { type: "image", data: "private-base64-image", mime_type: "image/png" }];
  return { files, fetchMock, store, controller, options: { input, store, signal: controller.signal, checkpoint } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("cartoon Gemini REST planner", () => {
  it("sends one stateless structured request and checkpoints raw output/usage", async () => {
    const h = harness();
    h.fetchMock.mockImplementation(async (url, init) => {
      expect(h.files.has("planner-intent.json")).toBe(true);
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
      expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "x-goog-api-key": "fake-key-never-sent-to-provider" } });
      const payload = JSON.parse(String(init?.body));
      expect(payload).toMatchObject({ model: CARTOON_PLANNER_MODEL, input: h.options.input, store: false, stream: false, response_format: { type: "text", mime_type: "application/json", schema: { type: "object" } } });
      // A real one-shot Request/body read, not an infinitely reusable mock object.
      const request = new Request(url, init); await request.text();
      expect(request.bodyUsed).toBe(true);
      return Response.json(wireResponse());
    });
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.files.get("planner-response.json")!.toString())).toMatchObject({ usage: { total_tokens: 123 } });
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("bypasses the SDK cloning path when Request.clone throws the reported error", async () => {
    const h = harness();
    vi.spyOn(Request.prototype, "clone").mockImplementation(() => { throw new TypeError("unusable"); });
    const client = new GoogleGenAI({ apiKey: "fake-key", httpOptions: { fetch: h.fetchMock } });
    await expect(client.interactions.create({ model: CARTOON_PLANNER_MODEL, input: "offline test", store: false }, { maxRetries: 0 })).rejects.toThrow(/Unexpected HTTP client error: TypeError: unusable/);
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reads pre-fix SDK checkpoints even without an API key", async () => {
    const h = harness(); vi.stubEnv("GEMINI_API_KEY", "");
    h.files.set("planner-response.json", Buffer.from(JSON.stringify({ output_text: output })));
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("stops before network activity when the key is missing", async () => {
    const h = harness(); vi.stubEnv("GEMINI_API_KEY", "  ");
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "missing_key" });
    expect(h.fetchMock).not.toHaveBeenCalled(); expect(h.store.save).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 429, 500, 503])("reports HTTP %i without leaking the response body or retrying", async (status) => {
    const h = harness(); h.fetchMock.mockResolvedValue(new Response("private-user-prompt fake-key-never-sent-to-provider", { status }));
    const error = await runCartoonPlanner(h.options).catch((e: Error) => e);
    expect(error).toMatchObject({ code: "http_error", httpStatus: status });
    expect(String(error)).not.toMatch(/private-user|fake-key/);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "uncertain_submission" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("classifies nested network causes without exposing arbitrary messages", async () => {
    const h = harness(); h.fetchMock.mockRejectedValue(new TypeError("private-user-prompt fake-key", { cause: Object.assign(new Error("sensitive host"), { code: "ECONNRESET" }) }));
    const error = await runCartoonPlanner(h.options).catch((e: Error) => e);
    expect(error).toMatchObject({ code: "transport_error", transportCause: "ECONNRESET" });
    expect(String(error)).not.toMatch(/private-user|fake-key|sensitive/);
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "uncertain_submission" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not retry a completed response when checkpoint storage fails", async () => {
    const h = harness(); h.store.save.mockImplementation(async (name, data) => {
      if (name === "planner-response.json") throw new Error("storage details");
      h.files.set(name, Buffer.from(JSON.stringify(data)));
    });
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "checkpoint_error" });
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "uncertain_submission" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not submit without a durable intent", async () => {
    const h = harness(); h.store.save.mockRejectedValue(new Error("storage unavailable"));
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/storage unavailable/);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("rejects malformed/oversized replies with no automatic resubmission", async () => {
    for (const body of ["not-json", "x".repeat(MEDIA_LIMITS.json + 1)]) {
      const h = harness(); h.fetchMock.mockResolvedValue(new Response(body));
      await expect(runCartoonPlanner(h.options)).rejects.toThrow(/Cartoon planner/);
      await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "uncertain_submission" });
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    }
  });
  it("persists blocked or incomplete responses without publishing them", async () => {
    const h = harness(); h.fetchMock.mockResolvedValue(Response.json({ status: "incomplete", steps: [] }));
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "incomplete_response" });
    expect(h.files.has("planner-response.json")).toBe(true);
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "incomplete_response" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never sends a request after cancellation", async () => {
    const h = harness(); h.controller.abort();
    await expect(runCartoonPlanner(h.options)).rejects.toThrow();
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("reports the request deadline as a timeout without retrying", async () => {
    vi.useFakeTimers(); const h = harness();
    h.fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    }));
    const pending = runCartoonPlanner(h.options).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await pending).toMatchObject({ code: "timeout" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts an in-flight request and does not persist output after cancellation", async () => {
    const h = harness(); h.fetchMock.mockImplementation(async (_url, init) => {
      h.controller.abort(new Error("sensitive cancel reason"));
      expect(init?.signal?.aborted).toBe(true);
      throw init?.signal?.reason;
    });
    const error = await runCartoonPlanner(h.options).catch((e: Error) => e);
    expect(error).toMatchObject({ code: "cancelled" }); expect(String(error)).not.toContain("sensitive");
    expect(h.files.has("planner-response.json")).toBe(false);
  });
});

describe("planner REST output parsing", () => {
  it("uses only the final model output, not user text or reasoning", () => {
    expect(plannerOutputText({ status: "completed", steps: [
      { type: "user_input", content: [{ type: "text", text: "ignore" }] },
      { type: "thought", content: [{ type: "text", text: "ignore" }] },
      { type: "model_output", content: [{ type: "text", text: "{" }, { type: "text", text: "}" }] },
    ] })).toBe("{}");
  });
  it.each([null, { status: "completed", steps: [] }, { status: "failed", output_text: "{}" }, { steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] }] }])("rejects invalid, empty and unfinished envelopes", (response) => {
    expect(() => plannerOutputText(response)).toThrow(/Cartoon planner/);
  });
});

describe("scoped request deadlines", () => {
  it("removes the parent listener on success and failure", async () => {
    const parent = new AbortController(); const remove = vi.spyOn(parent.signal, "removeEventListener");
    expect(await withRequestDeadline(parent.signal, 1000, async () => "ok")).toBe("ok");
    await expect(withRequestDeadline(parent.signal, 1000, async () => { throw new Error("test"); })).rejects.toThrow("test");
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it("rejects an already-aborted parent before invoking the operation", async () => {
    const parent = new AbortController(); parent.abort(); const operation = vi.fn();
    await expect(withRequestDeadline(parent.signal, 1000, operation)).rejects.toThrow(); expect(operation).not.toHaveBeenCalled();
  });
  it("keeps the deadline active while reading the response body", async () => {
    const parent = new AbortController();
    const pending = withRequestDeadline(parent.signal, 15, async (signal) => {
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } });
      return readBoundedBody(body, 1024, signal);
    });
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("clears the timer after an operation completes", async () => {
    vi.useFakeTimers();
    await withRequestDeadline(new AbortController().signal, 1000, async () => "done");
    expect(vi.getTimerCount()).toBe(0);
  });
});
