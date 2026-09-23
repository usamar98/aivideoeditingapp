import "server-only";
import { runs } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jobOperations } from "./types";

const pendingMessage = "Cancellation requested, but the worker has not confirmed it yet. Credits and the job slot remain reserved. Retry cancellation in a moment.";
const requestOptions = { timeoutInMs: 6000, retry: { maxAttempts: 1 } };

export async function cancelJob(db: SupabaseClient, admin: SupabaseClient, userId: string, jobId: string) {
  const { data: job, error } = await db.from("generations").select("id,status,requested_by,provider_request_id,operation,settings,created_at")
    .eq("id", jobId).eq("requested_by", userId).in("operation", [...jobOperations]).maybeSingle();
  if (error) return { code: 503, body: { error: "Could not read the job. Please retry." } };
  if (!job) return { code: 404, body: { error: "Job not found." } };
  if (job.status === "cancelled") return { code: 200, body: { generationId: jobId, status: "cancelled", duplicate: true } };
  if (["succeeded", "failed"].includes(job.status)) return { code: 409, body: { error: `Job already ${job.status}. Refresh the list.` } };
  const requested = await admin.rpc("request_generation_cancellation", { job_id: jobId, owner_id: userId });
  if (requested.error) return { code: 503, body: { error: "Could not request cancellation. Apply the jobs migration and retry." } };
  if (["succeeded", "failed", "cancelled"].includes(requested.data?.status)) return { code: 200, body: { generationId: jobId, status: requested.data.status } };
  if (!process.env.TRIGGER_SECRET_KEY) return { code: 202, body: { status: "cancelling", error: "Cancellation requested. The server needs TRIGGER_SECRET_KEY to stop the worker. Credits remain reserved until it stops." } };
  try {
    let runId: string | undefined = requested.data?.runId || job.provider_request_id;
    if (!runId) {
      // Recover a lost dispatch response. Legacy runs have only a project tag;
      // check their payload before ever cancelling one of those candidates.
      const project = z.object({ projectId: z.string().uuid() }).safeParse(job.settings);
      const tag = project.success ? `project:${project.data.projectId}` : `generation:${jobId}`;
      let inspected = 0;
      for await (const candidate of runs.list({ tag, from: new Date(job.created_at), taskIdentifier: job.operation === "episode-export" ? "episode-pipeline" : "faceless-pipeline" }, requestOptions)) {
        if (++inspected > 3) break;
        const run = await runs.retrieve(candidate.id, requestOptions);
        if (z.object({ generationId: z.literal(jobId) }).safeParse(run.payload).success) { runId = run.id; break; }
      }
    }
    if (!runId) return { code: 202, body: { status: "cancelling", error: pendingMessage } };
    // Even stored run IDs are untrusted: legacy clients can insert generation
    // rows. Bind the actual Trigger payload to this owned database job first.
    const existingRun = await runs.retrieve(runId, requestOptions);
    if (!z.object({ generationId: z.literal(jobId) }).safeParse(existingRun.payload).success) {
      return { code: 409, body: { status: "cancelling", error: "Worker identity could not be verified. No worker was cancelled; contact support with this job ID." } };
    }
    if (!existingRun.isCompleted) await runs.cancel(runId, requestOptions).catch(() => undefined);
    const run = existingRun.isCompleted ? existingRun : await runs.retrieve(runId, requestOptions);
    if (!run.isCompleted) return { code: 202, body: { status: "cancelling", error: pendingMessage } };
    const confirmed = await admin.rpc("confirm_generation_cancellation", { job_id: jobId });
    if (confirmed.error) return { code: 503, body: { status: "cancelling", error: "Worker stopped, but credit settlement could not finish. Retry cancellation; it cannot refund twice." } };
    return { code: 200, body: { generationId: jobId, status: String(confirmed.data), creditsReleased: confirmed.data === "cancelled" } };
  } catch {
    return { code: 202, body: { status: "cancelling", error: pendingMessage } };
  }
}
