"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancelJobButton } from "./cancel-job-button";
import { activeJobStatuses, jobFilters, jobStatusLabel, type JobFilter, type JobsPageData } from "@/lib/jobs/types";

const labels: Record<JobFilter, string> = { running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled" };
const operationLabels: Record<string, string> = { "faceless-script": "AI script", "faceless-render": "Faceless render", "episode-export": "Episode export" };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function JobsDashboard({ initial, demo, initialError }: { initial: JobsPageData; demo: boolean; initialError: string | null }) {
  const [filter, setFilter] = useState<JobFilter>("running");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (document.visibilityState === "hidden") { timer = setTimeout(load, 4000); return; }
      setLoading(true);
      try {
        const response = await fetch(`/api/jobs?filter=${filter}&page=${page}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not refresh jobs.");
        if (!stopped) {
          setData(result); setError(null);
          const lastPage = Math.max(0, Math.ceil(result.total / result.pageSize) - 1);
          if (page > lastPage) setPage(lastPage);
        }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Could not refresh jobs.");
      } finally {
        if (!stopped) { setLoading(false); timer = setTimeout(load, filter === "running" ? 4000 : 15000); }
      }
    }
    void load();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [demo, filter, page, refresh]);

  function changeFilter(value: string) {
    setFilter(value as JobFilter); setPage(0); setData({ jobs: [], total: 0, page: 0, pageSize: 25 });
  }
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow text-primary">Your studio, in motion</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">Jobs</h1><p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">See what’s running, revisit completed work, or stop a job you no longer need.</p></div><Button variant="outline" disabled={demo || loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button></div>
    <Card className="my-8 flex items-start gap-4 border-primary/15 bg-accent/40 p-5"><Activity className="mt-1 size-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Two active jobs per workspace</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Waiting, queued, and running jobs occupy a slot. Cancellation releases the slot and returns reserved credits after the worker stops.</p></div></Card>
    {demo && <p className="mb-6 rounded-xl border border-border p-4 text-sm">Demo workspace: no live jobs are loaded and cancellation is disabled. Sign in to your connected account to manage your jobs.</p>}
    <Tabs value={filter} onValueChange={changeFilter}>
      <TabsList className="mb-5 flex h-auto w-fit flex-wrap" aria-label="Job status filters">{jobFilters.map((value) => <TabsTrigger key={value} value={value}>{labels[value]}</TabsTrigger>)}</TabsList>
      {jobFilters.map((value) => <TabsContent key={value} value={value}>
        {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/25 p-4 text-sm">{error} Existing rows may be out of date.</p>}
        <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{data.total} {labels[value].toLowerCase()} {data.total === 1 ? "job" : "jobs"}</span><span>{demo ? "Account preview" : loading ? "Updating…" : "Auto-refresh on · times in UTC"}</span></div>
        {data.jobs.length === 0 ? <Card className="p-10 text-center"><Clock3 className="mx-auto size-8 text-primary/60" /><h2 className="mt-4 text-lg font-semibold">{loading ? "Loading jobs…" : error ? "Job list unavailable" : `No ${labels[value].toLowerCase()} jobs`}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{value === "running" ? "Your script and video generation jobs will appear here when you start them." : "Jobs move here when they reach this status. Your saved projects stay in the studio."}</p><Button asChild variant="outline" className="mt-5"><Link href="/studio/faceless">Create a video <ArrowRight /></Link></Button></Card> : <div className="space-y-4">{data.jobs.map((job) => {
          const active = activeJobStatuses.some((status) => status === job.status);
          return <Card key={job.id} className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 flex-1"><div className="mb-3 flex flex-wrap items-center gap-3"><span className="eyebrow text-primary">{operationLabels[job.operation]}</span><span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium">{job.status === "succeeded" && <CheckCircle2 className="size-3.5" />}{jobStatusLabel(job)}</span></div><h2 className="break-words text-lg font-semibold">{job.title}</h2><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{job.id}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>Started {dateFormat.format(new Date(job.createdAt))} UTC</span><span>{active ? `${job.reservedCredits} credits reserved` : `${job.usedCredits ?? 0} credits used`}</span>{job.completedAt && <span>Finished {dateFormat.format(new Date(job.completedAt))} UTC</span>}</div>{job.cancelRequested && active && <p className="mt-3 text-xs leading-6 text-muted-foreground">Stop requested. Waiting for worker confirmation before releasing credits and the slot.</p>}</div><div className="flex flex-wrap items-center gap-3">{job.projectHref && <Button asChild variant="outline" size="sm"><Link href={job.projectHref}>Open project <ArrowRight /></Link></Button>}{active && <CancelJobButton jobId={job.id} title={job.title} requested={job.cancelRequested} disabled={demo} onUpdate={() => setRefresh((current) => current + 1)} />}</div></div></Card>;
        })}</div>}
        {data.total > data.pageSize && <div className="mt-6 flex items-center justify-center gap-4"><Button variant="outline" disabled={loading || page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="text-sm">Page {page + 1} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="outline" disabled={loading || (page + 1) * data.pageSize >= data.total} onClick={() => setPage((current) => current + 1)}>Next</Button></div>}
      </TabsContent>)}
    </Tabs>
    <p className="mt-7 text-xs leading-6 text-muted-foreground">Cancellation sends a backend stop request immediately. Provider-side work already in progress may not stop instantly. A cancelled job never publishes a new result.</p>
  </main>;
}
