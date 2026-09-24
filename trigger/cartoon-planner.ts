import { z } from "zod";
import type { FalClient } from "@fal-ai/client";
import { cartoonStorySchema } from "../src/lib/cartoons/schema";
import { MEDIA_LIMITS } from "./media-io";
import { CARTOON_PLANNER_ENDPOINT, CARTOON_PLANNER_MODEL, runFalStage } from "./cartoon-fal";

export { CARTOON_PLANNER_MODEL, CARTOON_PLANNER_ENDPOINT } from "./cartoon-fal";
export type PlannerInput = ({ type: "text"; text: string } | { type: "image"; data: string; mime_type: string })[];
type Store = { load: (name: string) => Promise<Buffer | null>; save: (name: string, value: unknown) => Promise<void> };
type FailureCode = "uncertain_submission" | "invalid_response" | "incomplete_response" | "empty_response" | "refused";
export class CartoonPlannerError extends Error {
  constructor(readonly code: FailureCode) {
    super(`Cartoon planner ${code} (fal; model ${CARTOON_PLANNER_MODEL}). No automatic duplicate submission.`);
    this.name = "CartoonPlannerError";
  }
}

export function cartoonPlannerRequest(input: PlannerInput) {
  return {
    model: CARTOON_PLANNER_MODEL, stream: false, max_tokens: 16_384,
    // Require schema-capable providers; never silently switch to a different model.
    provider: { require_parameters: true, allow_fallbacks: true },
    messages: [{ role: "user", content: input.map((part) => part.type === "text" ? part : {
      type: "image_url", image_url: { url: `data:${part.mime_type};base64,${part.data}` },
    }) }],
    response_format: { type: "json_schema", json_schema: {
      name: "cartoon_story", strict: true, schema: z.toJSONSchema(cartoonStorySchema, { target: "draft-7" }),
    } },
  };
}

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string().nullable(),
    message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }),
  })).length(1),
  error: z.unknown().optional(),
});
export function plannerOutputText(raw: unknown) {
  const parsed = completionSchema.safeParse(raw);
  if (!parsed.success || parsed.data.error != null) throw new CartoonPlannerError("invalid_response");
  const choice = parsed.data.choices[0];
  if (choice.message.refusal || choice.finish_reason === "content_filter") throw new CartoonPlannerError("refused");
  if (choice.finish_reason !== "stop") throw new CartoonPlannerError("incomplete_response");
  const text = choice.message.content;
  if (!text?.trim()) throw new CartoonPlannerError("empty_response");
  if (Buffer.byteLength(text) > MEDIA_LIMITS.json) throw new CartoonPlannerError("invalid_response");
  // Do not include provider text or Zod issue values in task logs.
  try { cartoonStorySchema.parse(JSON.parse(text)); }
  catch { throw new CartoonPlannerError("invalid_response"); }
  return text;
}

const contentSchema = z.object({ type: z.string(), text: z.string().optional() });
const interactionSchema = z.object({
  status: z.string().optional(), output_text: z.string().optional(),
  steps: z.array(z.object({ type: z.string(), content: z.array(contentSchema).optional() })).optional(),
});
function legacyPlannerOutputText(raw: unknown) {
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
  input: PlannerInput; client: FalClient; signal: AbortSignal; store: Store;
  checkpoint: () => Promise<void>; pause: () => Promise<unknown>;
}) {
  const { input, client, signal, store, checkpoint, pause } = options;
  await checkpoint();
  const cached = await store.load("planner-response.json");
  if (cached) {
    let parsed: unknown;
    try { parsed = JSON.parse(cached.toString()); } catch { throw new CartoonPlannerError("invalid_response"); }
    return legacyPlannerOutputText(parsed);
  }
  // A pre-migration Google request may already have incurred a charge. A new
  // provider is not permission to repeat an ambiguous request in the same job.
  if (await store.load("planner-intent.json")) throw new CartoonPlannerError("uncertain_submission");
  const raw = await runFalStage({
    client, store, signal, checkpoint, pause, name: "planner-fal",
    endpoint: CARTOON_PLANNER_ENDPOINT, model: CARTOON_PLANNER_MODEL, input: cartoonPlannerRequest(input),
  });
  // runFalStage saves the complete response (including model/usage) before any
  // validation and resumes existing request IDs without another paid POST.
  await checkpoint();
  return plannerOutputText(raw);
}
