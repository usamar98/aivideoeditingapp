import { afterEach, describe, expect, it, vi } from "vitest";
import type { FalClient } from "@fal-ai/client";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { CARTOON_PLANNER_ENDPOINT, CARTOON_PLANNER_MODEL, cartoonPlannerRequest, plannerOutputText, runCartoonPlanner, type PlannerInput } from "../trigger/cartoon-planner";
import { cartoonFalClient } from "../trigger/cartoon-fal";
import { MEDIA_LIMITS } from "../trigger/media-io";

const output = JSON.stringify(cartoonDemo.storyboard);
const wireResponse = () => ({ id: "completion-test", model: CARTOON_PLANNER_MODEL,
  choices: [{ finish_reason: "stop", message: { role: "assistant", content: output, refusal: null } }],
  usage: { total_tokens: 123, prompt_tokens: 23, completion_tokens: 100, cost: 0.001 },
});
function harness() {
  vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("OPENROUTER_API_KEY", "");
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected direct network call")); vi.stubGlobal("fetch", fetchMock);
  const files = new Map<string, Buffer>();
  const store = { load: vi.fn(async (name: string) => files.get(name) || null),
    save: vi.fn(async (name: string, value: unknown) => { files.set(name, Buffer.from(JSON.stringify(value))); }) };
  const controller = new AbortController(); const checkpoint = vi.fn(async () => { controller.signal.throwIfAborted(); });
  const input: PlannerInput = [{ type: "text", text: "private-user-prompt" }, { type: "image", data: "cHJpdmF0ZQ==", mime_type: "image/png" }];
  const client = { queue: { submit: vi.fn().mockResolvedValue({ request_id: "fal-request-1" }), status: vi.fn().mockResolvedValue({ status: "COMPLETED" }),
    result: vi.fn().mockResolvedValue({ data: wireResponse() }), cancel: vi.fn().mockResolvedValue({}) } };
  return { files, fetchMock, client, store, controller, options: { input, store, signal: controller.signal, checkpoint,
    pause: vi.fn().mockResolvedValue(undefined), client: client as unknown as FalClient } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("cartoon Gemini through fal", () => {
  it("uses the verified model, image inputs, strict JSON schema and bounded output", () => {
    const h = harness(); const body = cartoonPlannerRequest(h.options.input);
    expect(CARTOON_PLANNER_MODEL).toBe("google/gemini-3.8-flash");
    expect(CARTOON_PLANNER_ENDPOINT).toBe("openrouter/router/openai/v1/chat/completions");
    expect(body).toMatchObject({ model: CARTOON_PLANNER_MODEL, stream: false, max_tokens: 16384,
      provider: { require_parameters: true, allow_fallbacks: true },
      response_format: { type: "json_schema", json_schema: { name: "cartoon_story", strict: true, schema: { type: "object", additionalProperties: false } } },
      messages: [{ role: "user", content: [{ type: "text", text: "private-user-prompt" }, { type: "image_url", image_url: { url: "data:image/png;base64,cHJpdmF0ZQ==" } }] }],
    });
    expect(body).not.toHaveProperty("models"); expect(body).not.toHaveProperty("tools");
  });
  it("supports text-only input and preserves reference order and mime types", () => {
    expect(cartoonPlannerRequest([{ type: "text", text: "idea" }]).messages[0].content).toEqual([{ type: "text", text: "idea" }]);
    const request = cartoonPlannerRequest([{ type: "text", text: "idea" }, { type: "image", data: "one", mime_type: "image/jpeg" }, { type: "image", data: "two", mime_type: "image/webp" }]);
    expect(request.messages[0].content.slice(1)).toEqual([{ type: "image_url", image_url: { url: "data:image/jpeg;base64,one" } }, { type: "image_url", image_url: { url: "data:image/webp;base64,two" } }]);
  });
  it("persists intent before submission and keeps the request, model, output and usage", async () => {
    const h = harness(); h.client.queue.submit.mockImplementation(async () => {
      expect(JSON.parse(h.files.get("planner-fal-intent.json")!.toString())).toMatchObject({ endpoint: CARTOON_PLANNER_ENDPOINT, model: CARTOON_PLANNER_MODEL });
      return { request_id: "fal-request-1" };
    });
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(JSON.parse(h.files.get("planner-fal-request.json")!.toString())).toEqual({ endpoint: CARTOON_PLANNER_ENDPOINT, model: CARTOON_PLANNER_MODEL, requestId: "fal-request-1" });
    expect(JSON.parse(h.files.get("planner-fal-result.json")!.toString())).toEqual(wireResponse());
    expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.client.queue.submit).toHaveBeenCalledTimes(1); expect(h.client.queue.result).toHaveBeenCalledTimes(1); expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.client.queue.submit.mock.calls[0][0]).toBe(CARTOON_PLANNER_ENDPOINT);
  });
  it("polls the same request without resubmitting while queued", async () => {
    const h = harness(); h.client.queue.status.mockResolvedValueOnce({ status: "IN_QUEUE" }).mockResolvedValueOnce({ status: "IN_PROGRESS" });
    expect(await runCartoonPlanner(h.options)).toBe(output); expect(h.options.pause).toHaveBeenCalledTimes(2); expect(h.client.queue.submit).toHaveBeenCalledTimes(1);
    for (const call of h.client.queue.status.mock.calls) expect(call[1].requestId).toBe("fal-request-1");
  });
  it("resumes a saved fal request without a duplicate POST", async () => {
    const h = harness(); h.files.set("planner-fal-request.json", Buffer.from(JSON.stringify({ endpoint: CARTOON_PLANNER_ENDPOINT, model: CARTOON_PLANNER_MODEL, requestId: "existing" })));
    expect(await runCartoonPlanner(h.options)).toBe(output); expect(h.client.queue.submit).not.toHaveBeenCalled(); expect(h.client.queue.status.mock.calls[0][1].requestId).toBe("existing");
  });
  it("refuses to resume a different model", async () => {
    const h = harness(); h.files.set("planner-fal-request.json", Buffer.from(JSON.stringify({ endpoint: CARTOON_PLANNER_ENDPOINT, model: "other-model", requestId: "existing" })));
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/);
    expect(h.client.queue.submit).not.toHaveBeenCalled(); expect(h.client.queue.status).not.toHaveBeenCalled();
  });
  it.each(["planner-intent.json", "planner-fal-intent.json"])("stops an uncertain submission recorded in %s", async (name) => {
    const h = harness(); h.files.set(name, Buffer.from("{}"));
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/); expect(h.client.queue.submit).not.toHaveBeenCalled();
  });
  it.each([{ output_text: output }, { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: output }] }] }])("reuses legacy Google output without calling either provider", async (saved) => {
    const h = harness(); h.files.set("planner-response.json", Buffer.from(JSON.stringify(saved))); h.files.set("planner-intent.json", Buffer.from("{}"));
    expect(await runCartoonPlanner(h.options)).toBe(output); expect(h.client.queue.submit).not.toHaveBeenCalled(); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("rejects corrupt legacy checkpoints without purchasing a replacement", async () => {
    const h = harness(); h.files.set("planner-response.json", Buffer.from("not-json"));
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "invalid_response" }); expect(h.client.queue.submit).not.toHaveBeenCalled();
  });
  it("does not submit unless the intent can be saved", async () => {
    const h = harness(); h.store.save.mockRejectedValue(new Error("private-storage-details"));
    await expect(runCartoonPlanner(h.options)).rejects.not.toThrow(/private-storage-details/); expect(h.client.queue.submit).not.toHaveBeenCalled();
  });
  it("does not resubmit when saving the request ID fails", async () => {
    const h = harness(); h.store.save.mockImplementation(async (name, value) => {
      if (name.endsWith("-request.json")) throw new Error("storage-details"); h.files.set(name, Buffer.from(JSON.stringify(value)));
    });
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/); await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/);
    expect(h.client.queue.submit).toHaveBeenCalledTimes(1); expect(h.client.queue.cancel).toHaveBeenCalledTimes(1);
  });
  it("recovers a result-checkpoint failure using the saved request", async () => {
    const h = harness(); let fail = true;
    h.store.save.mockImplementation(async (name, value) => {
      if (name.endsWith("-result.json") && fail) { fail = false; throw new Error("storage-details"); } h.files.set(name, Buffer.from(JSON.stringify(value)));
    });
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/);
    expect(await runCartoonPlanner(h.options)).toBe(output); expect(h.client.queue.submit).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 422, 429, 503])("reports fal HTTP %i without exposing bodies or resubmitting", async (status) => {
    const h = harness(); h.client.queue.submit.mockRejectedValue(Object.assign(new Error("private-user-prompt fake-secret"), { status }));
    const error = await runCartoonPlanner(h.options).catch((value: Error) => value);
    expect(error).toMatchObject({ httpStatus: status }); expect(String(error)).not.toMatch(/private-user|fake-secret/);
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/); expect(h.client.queue.submit).toHaveBeenCalledTimes(1);
  });
  it("does not resubmit after an ambiguous network failure", async () => {
    const h = harness(); h.client.queue.submit.mockRejectedValue(new TypeError("private host"));
    await expect(runCartoonPlanner(h.options)).rejects.not.toThrow(/private host/);
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/); expect(h.client.queue.submit).toHaveBeenCalledTimes(1);
  });
  it("retains incomplete output privately without accepting it or buying another", async () => {
    const h = harness(); const raw = wireResponse(); raw.choices[0].finish_reason = "length"; h.client.queue.result.mockResolvedValue({ data: raw });
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "incomplete_response" }); expect(h.files.has("planner-fal-result.json")).toBe(true);
    await expect(runCartoonPlanner(h.options)).rejects.toMatchObject({ code: "incomplete_response" }); expect(h.client.queue.submit).toHaveBeenCalledTimes(1);
  });
  it("checks cancellation before submission", async () => {
    const h = harness(); h.controller.abort(); await expect(runCartoonPlanner(h.options)).rejects.toThrow(); expect(h.client.queue.submit).not.toHaveBeenCalled();
  });
  it("cancels a queued fal request without retrieving its output", async () => {
    const h = harness(); h.client.queue.status.mockResolvedValue({ status: "IN_QUEUE" }); h.options.pause.mockImplementation(async () => { h.controller.abort(); });
    await expect(runCartoonPlanner(h.options)).rejects.toThrow();
    expect(h.client.queue.cancel).toHaveBeenCalledWith(CARTOON_PLANNER_ENDPOINT, expect.objectContaining({ requestId: "fal-request-1" })); expect(h.client.queue.result).not.toHaveBeenCalled();
  });
  it("bounds polling without another submission", async () => {
    const h = harness(); h.client.queue.status.mockResolvedValue({ status: "IN_PROGRESS" });
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/);
    expect(h.client.queue.status).toHaveBeenCalledTimes(120); expect(h.client.queue.submit).toHaveBeenCalledTimes(1); expect(h.client.queue.cancel).toHaveBeenCalledTimes(1);
  });
});

describe("fal-only HTTP adapter", () => {
  it("uses only FAL_KEY and makes one paid submission, then reads from fal", async () => {
    const h = harness(); vi.stubEnv("FAL_KEY", "fake-fal-key");
    h.fetchMock.mockImplementation(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/queue\.fal\.run\//);
      if (init?.method === "POST") {
        expect(String(url)).toBe(`https://queue.fal.run/${CARTOON_PLANNER_ENDPOINT}`); expect(init.headers).toMatchObject({ Authorization: "Key fake-fal-key" });
        expect(init.headers).not.toHaveProperty("x-goog-api-key"); expect(JSON.parse(String(init.body))).toEqual(cartoonPlannerRequest(h.options.input));
        return Response.json({ status: "IN_QUEUE", request_id: "fal-request-1", response_url: "unused", status_url: "unused", cancel_url: "unused", queue_position: 0 });
      }
      if (String(url).includes("/status")) return Response.json({ status: "COMPLETED", request_id: "fal-request-1", logs: null });
      return Response.json(wireResponse());
    });
    h.options.client = cartoonFalClient(); expect(await runCartoonPlanner(h.options)).toBe(output);
    expect(h.fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("rejects arbitrary planner models before making a request", async () => {
    const h = harness(); vi.stubEnv("FAL_KEY", "fake-fal-key");
    await expect(cartoonFalClient().queue.submit(CARTOON_PLANNER_ENDPOINT, { input: { model: "unapproved" } })).rejects.toThrow(/allowlisted/); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("requires FAL_KEY even if a Google key exists", () => {
    harness(); vi.stubEnv("FAL_KEY", ""); vi.stubEnv("GEMINI_API_KEY", "fake-google-key"); expect(() => cartoonFalClient()).toThrow(/FAL_KEY/);
  });
  it("keeps the submit deadline without automatic POST retries", async () => {
    vi.useFakeTimers(); const h = harness(); vi.stubEnv("FAL_KEY", "fake-fal-key"); h.options.client = cartoonFalClient();
    h.fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }); }));
    const pending = runCartoonPlanner(h.options).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(0); expect(h.fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000); expect(await pending).toBeInstanceOf(Error); expect(vi.getTimerCount()).toBe(0);
    await expect(runCartoonPlanner(h.options)).rejects.toThrow(/No automatic duplicate/); expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("planner completion validation", () => {
  it("accepts a completed schema-valid story", () => { expect(plannerOutputText(wireResponse())).toBe(output); });
  it.each([null, {}, { choices: [] }, { ...wireResponse(), error: { message: "private provider details" } }])("rejects invalid envelopes", (raw) => {
    expect(() => plannerOutputText(raw)).toThrow(/invalid_response/);
  });
  it.each(["length", "tool_calls", "error"])("rejects incomplete finish reason %s", (reason) => {
    const raw = wireResponse(); raw.choices[0].finish_reason = reason; expect(() => plannerOutputText(raw)).toThrow(/incomplete_response/);
  });
  it("rejects safety refusals without printing their text", () => {
    const raw = wireResponse(); raw.choices[0].finish_reason = "content_filter"; expect(() => plannerOutputText(raw)).toThrow(/refused/);
    expect(() => plannerOutputText({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "private refusal" } }] })).toThrow(/refused/);
  });
  it.each(["not-json", "{}", `\`\`\`json\n${output}\n\`\`\``])("rejects malformed or schema-invalid story output", (text) => {
    const raw = wireResponse(); raw.choices[0].message.content = text; expect(() => plannerOutputText(raw)).toThrow(/invalid_response/);
  });
  it("rejects oversized or empty output", () => {
    const raw = wireResponse(); raw.choices[0].message.content = "x".repeat(MEDIA_LIMITS.json + 1); expect(() => plannerOutputText(raw)).toThrow(/invalid_response/);
    raw.choices[0].message.content = " "; expect(() => plannerOutputText(raw)).toThrow(/empty_response/);
  });
});
