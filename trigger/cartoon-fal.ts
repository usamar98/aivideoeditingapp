import { createFalClient, type FalClient } from "@fal-ai/client";
import { z } from "zod";
import { CHARACTER_IMAGE_MODEL, cartoonModels } from "../src/lib/cartoons/schema";
import { MEDIA_LIMITS, readBoundedBody } from "./media-io";
import { withRequestDeadline } from "./request-deadline";

// Verified against fal's OpenRouter catalog on 2026-09-24. Server-owned, never user supplied.
export const CARTOON_PLANNER_MODEL = "google/gemini-3.8-flash";
export const CARTOON_PLANNER_ENDPOINT = "openrouter/router/openai/v1/chat/completions";
export const requestRecordSchema = z.object({ endpoint: z.string(), requestId: z.string().min(1), model: z.string().optional() });
export class CartoonProviderError extends Error {
  constructor(readonly stage: string, readonly endpoint: string, readonly requestId?: string, readonly httpStatus?: number) {
    super(`Cartoon provider stage ${stage} failed (${endpoint}; request ${requestId || "unconfirmed"}${httpStatus ? `; HTTP ${httpStatus}` : ""}). Check model access, provider balance and request status. No automatic duplicate submission.`);
    this.name = "CartoonProviderError";
  }
}
type Store = { load: (name: string) => Promise<Buffer | null>; save: (name: string, value: unknown) => Promise<void> };
export function cartoonFalClient() {
  if (!process.env.FAL_KEY) throw new Error("Worker FAL_KEY is missing");
  // Submitting twice after a lost HTTP response can bill twice. Worker retries
  // resume saved request IDs; automatic transport resubmission is disabled.
  const key = process.env.FAL_KEY;
  const client = createFalClient({ credentials: key, retry: { maxRetries: 0 } });
  // SDK 1.10.1 queue.submit overrides config.retry with three retries. Use a
  // single native POST for this non-idempotent operation; retain SDK read/cancel.
  const allowed = new Set([CARTOON_PLANNER_ENDPOINT, `${CHARACTER_IMAGE_MODEL}/text-to-image`, `${CHARACTER_IMAGE_MODEL}/edit`, ...Object.values(cartoonModels).map((model) => model.endpoint)]);
  client.queue.submit = async (endpoint, options) => {
    if (!allowed.has(endpoint)) throw new Error("Cartoon model is not allowlisted");
    if (endpoint === CARTOON_PLANNER_ENDPOINT && (options.input as { model?: unknown } | undefined)?.model !== CARTOON_PLANNER_MODEL) throw new Error("Cartoon planner model is not allowlisted");
    const signal = options.abortSignal || AbortSignal.timeout(60_000);
    const response = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", redirect: "error", signal,
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", "X-Fal-Request-Timeout": "300" }, body: JSON.stringify(options.input) });
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error("fal submission rejected"), { status: response.status }); }
    if (!response.body) throw new Error("fal submission returned no body");
    return z.object({ status: z.literal("IN_QUEUE"), request_id: z.string().min(1), response_url: z.string(), status_url: z.string(), cancel_url: z.string(), queue_position: z.number() })
      .parse(JSON.parse((await readBoundedBody(response.body, MEDIA_LIMITS.json, signal)).toString()));
  };
  return client;
}
export async function runFalStage(options: {
  client: FalClient; store: Store; name: string; endpoint: string; input: Record<string, unknown>;
  model?: string;
  signal: AbortSignal; checkpoint: () => Promise<void>; pause: () => Promise<unknown>;
}) {
  const { client, store, name, endpoint, input, model, signal, checkpoint, pause } = options;
  await checkpoint();
  const cached = await store.load(`${name}-result.json`);
  if (cached) return JSON.parse(cached.toString()) as unknown;
  const saved = await store.load(`${name}-request.json`);
  let requestId: string | undefined;
  try {
    if (saved) {
      const record = requestRecordSchema.parse(JSON.parse(saved.toString()));
      if (record.endpoint !== endpoint) throw new Error("Saved provider model does not match");
      if (model && record.model !== model) throw new Error("Saved planner model does not match");
      requestId = record.requestId;
    } else {
      if (await store.load(`${name}-intent.json`)) throw new Error("Provider submission was uncertain. Contact support; it will not be submitted again automatically.");
      await store.save(`${name}-intent.json`, { endpoint, ...(model ? { model } : {}), submittedAt: new Date().toISOString() });
      await checkpoint();
      const submitted = await withRequestDeadline(signal, 60_000, (submitSignal) => client.queue.submit(endpoint, { input, startTimeout: 300, abortSignal: submitSignal }));
      requestId = submitted.request_id;
      await store.save(`${name}-request.json`, { endpoint, requestId, ...(model ? { model } : {}) });
    }
    const pollingRequestId = requestId;
    for (let poll = 0; poll < 120; poll++) {
      await checkpoint();
      const status = await withRequestDeadline(signal, 30_000, (statusSignal) => client.queue.status(endpoint, { requestId: pollingRequestId, logs: false, abortSignal: statusSignal }));
      if (status.status === "COMPLETED") {
        await checkpoint();
        const result = await withRequestDeadline(signal, 60_000, (resultSignal) => client.queue.result(endpoint, { requestId: pollingRequestId, abortSignal: resultSignal }));
        await store.save(`${name}-result.json`, result.data);
        return result.data as unknown;
      }
      await pause();
    }
    throw new Error("Provider generation timed out");
  } catch (error) {
    if (requestId) await client.queue.cancel(endpoint, { requestId, abortSignal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    // Never leak provider response bodies, signed URLs or credentials to logs.
    if (signal.aborted) throw error;
    const http = z.object({ status: z.number().int().min(400).max(599) }).safeParse(error);
    throw new CartoonProviderError(name, endpoint, requestId, http.success ? http.data.status : undefined);
  }
}
