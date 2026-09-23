import type { SupabaseClient } from "@supabase/supabase-js";
import { AbortTaskRunError } from "@trigger.dev/sdk";

export async function assertJobActive(db: SupabaseClient, id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const { data, error } = await db.from("generations").select("status,cancel_requested_at").eq("id", id).single();
  if (error || !data) throw new Error("Could not verify job state; refusing to continue paid work.");
  if (data.cancel_requested_at || ["succeeded", "failed", "cancelled"].includes(data.status)) throw new AbortTaskRunError("Job stopped or cancellation requested");
  signal.throwIfAborted();
}

export async function claimJob(db: SupabaseClient, id: string, runId: string, attempt: number) {
  const { data, error } = await db.rpc("claim_generation_job", { job_id: id, run_id: runId, attempt });
  if (error) throw new Error(`Cannot claim job: ${error.message}`);
  if (!data) throw new AbortTaskRunError("Job is no longer runnable");
}

export async function finishCancelledJob(db: SupabaseClient, id: string, runPromise: Promise<unknown>) {
  // The hook runs concurrently with the aborting task. Do not release its slot
  // while the run function is still working. Trigger enforces a 30s hook limit.
  const { data: job, error } = await db.from("generations").select("requested_by").eq("id", id).single();
  if (error || !job) throw new Error("Could not read cancelled job");
  const requested = await db.rpc("request_generation_cancellation", { job_id: id, owner_id: job.requested_by });
  if (requested.error) throw new Error("Could not record worker cancellation");
  await runPromise.catch(() => undefined);
  const confirmed = await db.rpc("confirm_generation_cancellation", { job_id: id });
  if (confirmed.error) throw new Error("Cancelled worker credit settlement failed");
}
