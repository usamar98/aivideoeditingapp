import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type JobStage = "read_saved_job" | "prepare_export" | "submit_task" | "save_run" | "request_cancel" | "read_cancel_state" | "stop_worker" | "settle_cancel" | "save_diagnostic";

// Never log arbitrary provider messages, bodies, headers, URLs, stacks, or
// payloads: SDK errors can contain credentials and signed media URLs.
export function safeJobError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : undefined;
  const code = typeof value.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3}|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT)$/.test(value.code) ? value.code : undefined;
  const name = typeof value.name === "string" ? value.name : "";
  let category = "unknown";
  let message = "The job service returned an unexpected error.";
  if (status === 401) { category = "authentication"; message = "Worker authentication failed. Check the server key for the intended project and environment."; }
  else if (status === 403 || code === "42501") { category = "permission"; message = "The job service denied access. Check the server key permissions."; }
  else if (status === 404) { category = "not_found"; message = "The worker resource was not found. Check the project, environment, and deployed task."; }
  else if (status === 429) { category = "rate_limit"; message = "The job service is rate limited. Retry in a moment."; }
  else if (status === 408 || status === 504 || code === "ETIMEDOUT" || ["APIConnectionTimeoutError", "TimeoutError", "AbortError"].includes(name)) { category = "timeout"; message = "The job service timed out; submission may still have been accepted."; }
  else if (status && status >= 500) { category = "unavailable"; message = "The job service is temporarily unavailable."; }
  else if (status === 400 || status === 422) { category = "invalid_request"; message = "The job service rejected the request. Check the deployed task and server configuration."; }
  else if (code && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code)) { category = "database"; message = "The saved job could not be updated. Check database permissions and migrations."; }
  else if (code || name === "APIConnectionError") { category = "connection"; message = "The job service could not be reached; submission may still have been accepted."; }
  return { category, status, code, message };
}

function triggerEnvironment() {
  const key = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!key) return "missing";
  if (key.startsWith("tr_dev_")) return "development";
  if (key.startsWith("tr_prod_")) return "production";
  if (key.startsWith("tr_stg_")) return "staging";
  if (key.startsWith("tr_preview_")) return "preview";
  return "unknown";
}

export function logJobFailure(stage: JobStage, generationId: string, error: unknown) {
  const diagnostic = safeJobError(error);
  console.error("[jobs]", { event: "operation_failed", stage, generationId, triggerEnvironment: triggerEnvironment(), ...diagnostic });
  return diagnostic;
}

export async function recordDispatchFailure(admin: SupabaseClient, generationId: string, stage: JobStage, error: unknown) {
  const diagnostic = logJobFailure(stage, generationId, error);
  const message = `${diagnostic.message} Reference: ${generationId} (${stage}${diagnostic.status ? `, HTTP ${diagnostic.status}` : ""}).`;
  try {
    const saved = await admin.from("generations").update({ error_message: message }).eq("id", generationId)
      .in("status", ["created", "reserved", "submitted"]).is("cancel_requested_at", null).is("reported_credits", null);
    if (saved.error) logJobFailure("save_diagnostic", generationId, saved.error);
  } catch (saveError) {
    logJobFailure("save_diagnostic", generationId, saveError);
  }
  return message;
}
