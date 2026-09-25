"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Captions, Download, LoaderCircle, Megaphone, Plus, RefreshCw, Save, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelJobButton } from "./cancel-job-button";
import { saveUgcPlan, startUgcJob } from "@/app/studio/ugc/actions";
import { ugcPresenters, UGC_PLAN_CREDITS, ugcRenderCredits, ugcScript, ugcWordLimit, type UgcHookId, type UgcPlan, type UgcProjectView } from "@/lib/ugc/schema";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal leading-6 outline-none focus:ring-2 focus:ring-primary/35";
export function UgcEditor({ initial, demo }: { initial: UgcProjectView; demo: boolean }) {
  const [project, setProject] = useState(initial), [plan, setPlan] = useState(initial.plan);
  const [selected, setSelected] = useState<UgcHookId[]>(["hook-1"]);
  const [approved, setApproved] = useState(false), [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false), [error, setError] = useState("");
  const editRevision = useRef(initial.revision);
  const [pending, startTransition] = useTransition();
  const busy = ["planning", "rendering"].includes(project.status);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (demo) return;
    const response = await fetch(`/api/ugc/${initial.id}`, { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not refresh your ad project.");
    setProject(data as UgcProjectView);
    if (!dirtyRef.current) setPlan((data as UgcProjectView).plan);
  }, [demo, initial.id]);
  useEffect(() => {
    if (demo || !busy) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (document.visibilityState !== "hidden") await refresh(controller.signal); }
      catch { if (!controller.signal.aborted) setError("Connection interrupted. The job can continue. Refresh to reconnect."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 5000); }
    };
    timer = setTimeout(poll, 2500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [busy, demo, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(next: UgcPlan) { if (!dirtyRef.current) editRevision.current = project.revision; setPlan(next); dirtyRef.current = true; setDirty(true); setApproved(false); }
  function run(action: "refresh" | "save" | "plan" | "render") {
    if (demo) return; setError("");
    startTransition(async () => {
      try {
        if (action === "save" && plan) {
          const result = await saveUgcPlan(project.id, editRevision.current, plan);
          if (result.error) throw new Error(result.error);
          dirtyRef.current = false; setDirty(false); setApproved(false);
        }
        if (action === "render" && dirtyRef.current) throw new Error("Save your script edits before rendering.");
        if (action === "plan" || action === "render") {
          const result = await startUgcJob(project.id, action, project.revision, selected, busy || approved);
          if (result.error) { await refresh(); throw new Error(result.error); }
        }
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The request failed. Please retry."); }
    });
  }
  const credits = selected.length ? ugcRenderCredits(project.brief.duration, selected.length) : 0;
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow text-primary">UGC & product ads / {project.status}</p><h1 className="editorial mt-3 max-w-3xl text-4xl sm:text-5xl">{project.title}</h1><p className="mt-4 text-xs text-muted-foreground">{project.brief.duration}s · {project.brief.aspectRatio} · English · Kling AI Avatar v2 Pro</p></div><div className="flex gap-2"><Button variant="outline" aria-label="Refresh ad project" disabled={demo || pending} onClick={() => run("refresh")}><RefreshCw /></Button><Button asChild variant="outline"><Link href={demo ? "/studio/ugc?preview=1" : "/studio/ugc"}>New ad <Plus /></Link></Button></div></div>
    <ol className="my-8 flex flex-wrap gap-5 text-xs text-muted-foreground"><li className="text-primary">01 · Product brief</li><li className={plan ? "text-primary" : ""}>02 · Presenter & hooks</li><li className={project.outputs.length ? "text-primary" : ""}>03 · Render & compare</li></ol>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent/40 p-4 text-sm">Interactive sample, not generated output. Edit hooks and select variants to explore costs. Saving, rendering and downloads require a real project.</p>}
    {(error || project.error) && <p role="alert" className="mb-6 rounded-xl border border-destructive/25 p-4 text-sm leading-6">{error || project.error} <Link href="/studio/jobs" className="text-primary underline">View jobs</Link></p>}
    {busy && <section role="status" className="mb-7 rounded-2xl border border-primary/20 bg-accent/50 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-3 text-sm"><LoaderCircle className="size-4 animate-spin text-primary" />{project.job?.cancelRequested ? "Stopping this ad job…" : project.job?.phase || "Waiting for the ad worker…"}</p><p className="mt-3 text-xs text-muted-foreground">You can leave and return. Your job, script and reserved credits are saved.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={pending || Boolean(project.job?.cancelRequested)} onClick={() => run(project.status === "planning" ? "plan" : "render")}>Reconnect job</Button>{project.job && <CancelJobButton jobId={project.job.id} title={project.title} requested={project.job.cancelRequested} onUpdate={refresh} />}</div></div></section>}
    {!plan ? <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-3xl border border-border bg-card p-7"><Sparkles className="size-8 text-primary" /><h2 className="editorial mt-5 text-3xl">Start with a strong opening.</h2><h3 className="mt-6 font-semibold">{project.brief.productName}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{project.brief.description}</p><div className="mt-5 rounded-xl bg-accent/40 p-4 text-xs leading-6"><p><strong>Audience:</strong> {project.brief.audience}</p><p className="mt-2"><strong>Approved benefits:</strong> {project.brief.benefits}</p>{project.brief.offer && <p className="mt-2"><strong>Offer:</strong> {project.brief.offer}</p>}</div><p className="mt-6 text-sm leading-7 text-muted-foreground">Create your fictional presenter, three hook options, and a shared script. Review and edit them before any video is rendered.</p><Button size="lg" className="mt-6" disabled={demo || pending || busy} onClick={() => run("plan")}><Sparkles />Create presenter & hooks · {UGC_PLAN_CREDITS} credits</Button></section><aside className="rounded-3xl border border-primary/20 bg-accent/30 p-7"><p className="eyebrow text-primary">Your creative budget</p><div className="mt-5 space-y-4 text-sm"><p className="flex justify-between gap-4"><span>Presenter + three hooks</span><strong>{UGC_PLAN_CREDITS} credits</strong></p><p className="flex justify-between gap-4"><span>Each {project.brief.duration}s ad</span><strong>{ugcRenderCredits(project.brief.duration, 1)} credits</strong></p><p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">Rendering is a separate step. Choose one, two or all three hooks after reviewing the plan. Failed or cancelled jobs return that job’s reserved credits. A completed planning stage stays charged.</p></div></aside></div> : <div className="grid items-start gap-7 xl:grid-cols-[1fr_320px]">
      <div><section className="mb-7 rounded-3xl border border-border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow text-primary">Your message, three openings</p><h2 className="editorial mt-2 text-3xl">Find the hook that fits.</h2></div><Button variant="outline" disabled={demo || busy || pending || !dirty} onClick={() => run("save")}><Save />{dirty ? "Save edits" : "Plan saved"}</Button></div><p className="mt-4 text-xs leading-6 text-muted-foreground">The body and CTA stay the same across variants. Each complete script has a {ugcWordLimit(project.brief.duration)}-word limit to leave room for natural delivery.</p></section>
        <fieldset disabled={busy || pending} className="min-w-0 space-y-4">
          {plan.hooks.map((hook, index) => { const words = ugcScript(plan, hook.id).split(/\s+/).length; return <article key={hook.id} className={`rounded-2xl border bg-card p-5 ${selected.includes(hook.id) ? "border-primary/55" : "border-border"}`}><div className="flex items-center justify-between gap-4"><span className="eyebrow text-primary">Hook {String(index + 1).padStart(2, "0")} · {hook.angle}</span><label className="flex shrink-0 items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(hook.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, hook.id] : ids.filter((id) => id !== hook.id))} className="accent-primary" />Render this</label></div><label className="mt-4 block text-xs font-semibold">Opening line<textarea rows={2} value={hook.hook} maxLength={140} onChange={(e) => edit({ ...plan, hooks: plan.hooks.map((item) => item.id === hook.id ? { ...item, hook: e.target.value } : item) })} className={field} /></label><p className={`mt-2 text-xs ${words > ugcWordLimit(project.brief.duration) ? "text-destructive" : "text-muted-foreground"}`}>{words}/{ugcWordLimit(project.brief.duration)} words with shared body & CTA</p></article>; })}
          <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-semibold">Shared message</h3><label className="mt-4 block text-xs font-semibold">Body copy<textarea rows={4} maxLength={500} value={plan.body} onChange={(e) => edit({ ...plan, body: e.target.value })} className={field} /></label><label className="mt-4 block text-xs font-semibold">Spoken call to action<input maxLength={100} value={plan.cta} onChange={(e) => edit({ ...plan, cta: e.target.value })} className={field} /></label><p className="mt-3 text-xs leading-6 text-muted-foreground">On-screen CTA: “{project.brief.cta}”. No fabricated reviews, personal experiences or unsupported product results.</p></section>
        </fieldset>
      </div>
      <aside className="space-y-5 xl:sticky xl:top-6"><section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="relative aspect-square bg-accent/30">{project.presenterUrl ? <Image src={project.presenterUrl} alt="Your generated fictional AI presenter" fill unoptimized sizes="320px" className="object-contain" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><UserRound className="size-16 stroke-1 text-primary/40" /><p className="text-xs">{demo ? "Sample layout · no generated portrait" : "Refresh to load your presenter"}</p></div>}</div><div className="p-5"><h2 className="text-sm font-semibold">{ugcPresenters[project.brief.presenter].name}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Fictional AI presenter · reused across variants. {project.brief.captions ? "Burned-in captions + SRT." : "Separate SRT captions."}</p>{!!project.productUrls.length && <div className="mt-4 flex gap-2">{project.productUrls.map((url, i) => <Image key={i} src={url} width={52} height={52} unoptimized alt={`Product photo ${i + 1}`} className="size-12 rounded-lg border border-border object-contain" />)}</div>}</div></section>
        <section className="rounded-2xl border border-primary/20 bg-accent/40 p-5"><p className="eyebrow text-primary">Ready to make your ads?</p><div className="mt-4 flex justify-between text-sm"><span>{selected.length} selected × {project.brief.duration}s</span><strong>{credits} credits</strong></div><label className="mt-5 flex items-start gap-3 text-xs leading-6"><input type="checkbox" checked={approved} disabled={busy || dirty} onChange={(e) => setApproved(e.target.checked)} className="mt-1.5 accent-primary" />I reviewed these claims and scripts. This is an AI spokesperson, not a genuine customer testimonial.</label><Button size="lg" className="mt-5 w-full" disabled={demo || busy || pending || dirty || !approved || !selected.length} onClick={() => run("render")}><Megaphone />Render ads · {credits} credits</Button>{dirty && <p className="mt-3 text-xs text-primary">Save your edits, then approve the script.</p>}<p className="mt-4 text-xs leading-6 text-muted-foreground">Selected ads render as one job. If that job fails or is cancelled, its reserved credits are returned. Earlier completed ads stay available. AI lip sync can vary.</p></section>
      </aside>
    </div>}
    {!!project.outputs.length && <section className="mt-12"><p className="eyebrow text-primary">Creative library</p><h2 className="editorial mt-3 text-3xl">Your ads, ready to compare.</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">These exports use the scripts shown below. Later edits do not change an existing video. Refresh above if a private link expires.</p><div className="mt-6 grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">{project.outputs.map((output) => <article key={output.id} className="overflow-hidden rounded-2xl border border-border bg-card p-4"><video controls playsInline preload="metadata" src={output.videoUrl} aria-label={`${output.angle} ad variant`} className="max-h-[480px] w-full rounded-xl bg-foreground" /><h3 className="mt-4 text-sm font-semibold">{output.angle}</h3><p className="mt-3 text-xs leading-6 text-muted-foreground">{output.script}</p><div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><a href={output.videoUrl} target="_blank" rel="noreferrer" download><Download />MP4</a></Button><Button asChild size="sm" variant="outline"><a href={output.captionsUrl} target="_blank" rel="noreferrer" download><Captions />SRT captions</a></Button></div></article>)}</div></section>}
  </main>;
}
