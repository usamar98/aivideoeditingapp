export const activeJobStatuses = ["created", "reserved", "submitted", "processing"] as const;
export const jobOperations = ["faceless-script", "faceless-render", "episode-export", "cartoon-plan", "cartoon-render", "ugc-plan", "ugc-render", "shorts-analyze", "shorts-render"] as const;
export type JobFilter = "running" | "done" | "failed" | "cancelled";
export const jobFilters: JobFilter[] = ["running", "done", "failed", "cancelled"];
export type JobView = {
  id: string; title: string; operation: string; status: string;
  createdAt: string; completedAt: string | null; cancelRequested: boolean;
  reservedCredits: number; usedCredits: number | null; projectHref: string | null;
};
export type JobsPageData = { jobs: JobView[]; total: number; page: number; pageSize: number };
export function jobStatusLabel(job: Pick<JobView, "status" | "cancelRequested">) {
  if (job.cancelRequested && activeJobStatuses.some((status) => status === job.status)) return "Cancelling";
  return ({ created: "Preparing", reserved: "Waiting for worker", submitted: "Queued", processing: "Running", succeeded: "Done", failed: "Failed", cancelled: "Cancelled" } as Record<string, string>)[job.status] || job.status;
}
