import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { activeJobStatuses, jobOperations, type JobFilter, type JobsPageData } from "./types";

const settingsSchema = z.object({ projectId: z.string().uuid().optional(), projectTitle: z.string().optional(), storyboard: z.object({ title: z.string() }).nullish(), brief: z.object({ topic: z.string().optional() }).optional() });

export async function getJobs(db: SupabaseClient, userId: string, filter: JobFilter, page = 0): Promise<JobsPageData> {
  const pageSize = 25;
  const statuses = filter === "running" ? [...activeJobStatuses] : [filter === "done" ? "succeeded" : filter];
  const { data, error, count } = await db.from("generations")
    .select("id,operation,status,settings,created_at,completed_at,cancel_requested_at,estimated_credits,reported_credits", { count: "exact" })
    .eq("requested_by", userId).in("operation", [...jobOperations]).in("status", statuses)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw new Error("Jobs could not be loaded. Check your connection and that the jobs migration has been applied.");
  return { page, pageSize, total: count || 0, jobs: (data || []).map((job) => {
    const settings = settingsSchema.safeParse(job.settings);
    const info = settings.success ? settings.data : {};
    return {
      id: job.id, operation: job.operation, status: job.status,
      title: info.projectTitle || info.storyboard?.title || info.brief?.topic?.slice(0, 100) || (job.operation === "episode-export" ? "Episode export" : "Faceless video"),
      createdAt: job.created_at, completedAt: job.completed_at, cancelRequested: Boolean(job.cancel_requested_at),
      reservedCredits: Number(job.estimated_credits), usedCredits: job.reported_credits === null ? null : Number(job.reported_credits),
      projectHref: info.projectId ? `/studio/${job.operation.startsWith("ugc-") ? "ugc" : job.operation.startsWith("cartoon-") ? "cartoons" : "faceless"}/${info.projectId}` : null,
    };
  }) };
}
