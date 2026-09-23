import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { JobsDashboard } from "@/components/studio/jobs-dashboard";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getJobs } from "@/lib/jobs/repository";
import type { JobsPageData } from "@/lib/jobs/types";

export const metadata = { title: "Jobs", robots: { index: false, follow: false } };

export default async function JobsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio/jobs");
  let initial: JobsPageData = { jobs: [], total: 0, page: 0, pageSize: 25 };
  let error: string | null = null;
  if (!viewer.fixture) {
    try {
      const db = await createClient();
      if (!db) throw new Error("Jobs require a connected account.");
      initial = await getJobs(db, viewer.id, "running");
    } catch (cause) { error = cause instanceof Error ? cause.message : "Jobs could not be loaded."; }
  }
  return <WorkspaceShell title="Job activity" active="Jobs"><JobsDashboard initial={initial} demo={viewer.fixture} initialError={error} /></WorkspaceShell>;
}
