import { z } from "zod";
import { cartoonStorySchema } from "../src/lib/cartoons/schema";
import { MEDIA_LIMITS, readBoundedBody } from "./media-io";
import { withRequestDeadline } from "./request-deadline";

export const CARTOON_PLANNER_MODEL = "gemini-3.8-flash";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
export type PlannerInput = ({ type: "text"; text: string } | { type: "image"; data: string; mime_type: string })[];
type Store = { load: (name: string) => Promise<Buffer | null>; save: (name: string, value: unknown) => Promise<void> };
type FailureCode = "missing_key" | "uncertain_submission" | "http_error" | "invalid_response" | "incomplete_response" | "empty_response" | "timeout" | "cancelled" | "transport_error" | "checkpoint_error";
export class CartoonPlannerError extends Error {
  constructor(readonly code: FailureCode, readonly httpStatus?: number, readonly transportCause?: string) {
    super(`Cartoon planner ${code} (model ${CARTOON_PLANNER_MODEL}${httpStatus ? `; HTTP ${httpStatus}` : ""}${transportCause ? `; cause ${transportCause}` : ""}). No automatic duplicate submission.`);
    this.name = "CartoonPlannerError";
  }
}

// Never log arbitrary SDK messages, prompts, images, URLs, headers or raw causes.
// Only recognize fixed error labels from the nested cause chain.
function transportCause(error: unknown) {
  const known = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "ERR_STREAM_PREMATURE_CLOSE"]);
  let current = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const item = current as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown };
    if (typeof item.code === "string" && known.has(item.code)) return item.code;
    if (item.name === "TypeError" && item.message === "unusable") return "REQUEST_BODY_UNUSABLE";
    current = item.cause;
  }
  return "UNCLASSIFIED_TRANSPORT_ERROR";
}

const contentSchema = z.object({ type: z.string(), text: z.string().optional() });
const interactionSchema = z.object({
  status: z.string().optional(), output_text: z.string().optional(),
  steps: z.array(z.object({ type: z.string(), content: z.array(contentSchema).optional() })).optional(),
});
export function plannerOutputText(raw: unknown) {
  const parsed = interactionSchema.safeParse(raw);
  if (!parsed.success) throw new CartoonPlannerError("invalid_response");
  const response = parsed.data;
  if (response.status && response.status !== "completed") throw new CartoonPlannerError("incomplete_response");
  // Backward compatibility with checkpoints written by the previous SDK worker.
  if (response.output_text?.trim()) return response.output_text;
  if (response.status !== "completed") throw new CartoonPlannerError("incomplete_response");
  const parts: string[] = [];
  let collecting = false;
  // Match Google's final-turn semantics; never concatenate thoughts/tool output.
  outer: for (const step of (response.steps || []).toReversed()) {
    if (step.type === "user_input") break;
    if (step.type !== "model_output" || !step.content) {
      if (collecting) break;
      continue;
    }
    for (const part of step.content.toReversed()) {
      if (part.type === "text") { collecting = true; parts.push(part.text || ""); }
      else if (collecting) break outer;
    }
  }
  const text = parts.reverse().join("");
  if (!text.trim()) throw new CartoonPlannerError("empty_response");
  return text;
}

export async function runCartoonPlanner(options: {
  input: PlannerInput; signal: AbortSignal; store: Store; checkpoint: () => Promise<void>;
}) {
  const { input, signal, store, checkpoint } = options;
  await checkpoint();
  const cached = await store.load("planner-response.json");
  if (cached) {
    let parsed: unknown;
    try { parsed = JSON.parse(cached.toString()); } catch { throw new CartoonPlannerError("invalid_response"); }
    return plannerOutputText(parsed);
  }
  if (await store.load("planner-intent.json")) throw new CartoonPlannerError("uncertain_submission");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new CartoonPlannerError("missing_key");
  const body = JSON.stringify({
    model: CARTOON_PLANNER_MODEL, input, store: false, stream: false,
    response_format: { type: "text", mime_type: "application/json", schema: z.toJSONSchema(cartoonStorySchema, { target: "draft-7" }) },
  });
  // Persist intent BEFORE sending a non-idempotent POST. If its response is lost,
  // retries stop rather than silently purchasing another story.
  await store.save("planner-intent.json", { model: CARTOON_PLANNER_MODEL, submittedAt: new Date().toISOString() });
  await checkpoint();
  let raw: unknown;
  try {
    raw = await withRequestDeadline(signal, 120_000, async (genaiSignal) => {
      // A fresh serialized body, one fetch, one body read: no SDK Request.clone()
      // retry path. Keep the exact same Gemini model, endpoint and output schema.
      const response = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: genaiSignal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new CartoonPlannerError("http_error", response.status);
      }
      if (!response.body) throw new CartoonPlannerError("empty_response");
      const bytes = await readBoundedBody(response.body, MEDIA_LIMITS.json, genaiSignal);
      try { return JSON.parse(bytes.toString()) as unknown; }
      catch { throw new CartoonPlannerError("invalid_response"); }
    });
  } catch (error) {
    if (signal.aborted) throw new CartoonPlannerError("cancelled");
    if (error instanceof CartoonPlannerError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new CartoonPlannerError("timeout");
    throw new CartoonPlannerError("transport_error", undefined, transportCause(error));
  }
  // Save even malformed/safety-blocked successful responses before validation.
  // Later attempts can inspect/reuse the private response without another bill.
  try { await store.save("planner-response.json", raw); }
  catch { throw new CartoonPlannerError("checkpoint_error"); }
  await checkpoint();
  return plannerOutputText(raw);
}
