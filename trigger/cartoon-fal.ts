import { createFalClient, type FalClient } from "@fal-ai/client";
import { z } from "zod";
import { CHARACTER_IMAGE_MODEL, cartoonModels } from "../src/lib/cartoons/schema";
import { MEDIA_LIMITS, readBoundedBody } from "./media-io";

export const requestRecordSchema = z.object({ endpoint: z.string(), requestId: z.string().min(1) });
type Store = { load: (name: string) => Promise<Buffer | null>; save: (name: string, value: unknown) => Promise<void> };
export function cartoonFalClient() {
  if (!process.env.FAL_KEY) throw new Error("Worker FAL_KEY is missing");
  // Submitting twice after a lost HTTP response can bill twice. Worker retries
  // resume saved request IDs; automatic transport resubmission is disabled.
  const key = process.env.FAL_KEY;
  const client = createFalClient({ credentials: key, retry: { maxRetries: 0 } });
  // SDK 1.10.1 queue.submit overrides config.retry with three retries. Use a
  // single native POST for this non-idempotent operation; retain SDK read/cancel.
  const allowed = new Set([`${CHARACTER_IMAGE_MODEL}/text-to-image`, `${CHARACTER_IMAGE_MODEL}/edit`, ...Object.values(cartoonModels).map((model) => model.endpoint)]);
  client.queue.submit = async (endpoint, options) => {
    if (!allowed.has(endpoint)) throw new Error("Cartoon model is not allowlisted");
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
  signal: AbortSignal; checkpoint: () => Promise<void>; pause: () => Promise<unknown>;
}) {
  const { client, store, name, endpoint, input, signal, checkpoint, pause } = options;
  await checkpoint();
  const cached = await store.load(`${name}-result.json`);
  if (cached) return JSON.parse(cached.toString()) as unknown;
  const saved = await store.load(`${name}-request.json`);
  let requestId: string | undefined;
  try {
    if (saved) {
      const record = requestRecordSchema.parse(JSON.parse(saved.toString()));
      if (record.endpoint !== endpoint) throw new Error("Saved provider model does not match");
      requestId = record.requestId;
    } else {
      if (await store.load(`${name}-intent.json`)) throw new Error("Provider submission was uncertain. Contact support; it will not be submitted again automatically.");
      await store.save(`${name}-intent.json`, { endpoint, submittedAt: new Date().toISOString() });
      await checkpoint();
      const submitted = await client.queue.submit(endpoint, { input, startTimeout: 300, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
      requestId = submitted.request_id;
      await store.save(`${name}-request.json`, { endpoint, requestId });
    }
    for (let poll = 0; poll < 120; poll++) {
      await checkpoint();
      const status = await client.queue.status(endpoint, { requestId, logs: false, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      if (status.status === "COMPLETED") {
        await checkpoint();
        const result = await client.queue.result(endpoint, { requestId, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
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
    throw new Error(`Cartoon provider stage ${name} failed (${endpoint}; request ${requestId || "unconfirmed"}${http.success ? `; HTTP ${http.data.status}` : ""}). Check model access, provider balance and request status. No automatic duplicate submission.`);
  }
}
