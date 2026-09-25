"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Download, LoaderCircle, Play, RefreshCw, Save, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveShortsPlan, startShortsJob } from "@/app/studio/shorts/actions";
import { shortsPlanSchema, validateShortsPlan, SHORTS_ANALYSIS_CREDITS, SHORTS_RENDER_CREDITS, type ShortsProjectView, type ShortsPlan, type ShortsClip } from "@/lib/shorts/schema";
import { activeJobStatuses } from "@/lib/jobs/types";
import { CancelJobButton } from "./cancel-job-button";
import { ShortsPreview } from "./shorts-preview";
import { shortsField } from "./shorts-creator";

export function ShortsEditor({ initial, demo = false }: { initial: ShortsProjectView; demo?: boolean }) {
  const [project, setProject] = useState(initial), [plan, setPlan] = useState<ShortsPlan | null>(initial.plan), [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string[]>(initial.plan?.clips.map((c) => c.id) || []), [focus, setFocus] = useState(initial.plan?.clips[0]?.id || "clip-1");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [pending, startTransition] = useTransition();
  const video = useRef<HTMLVideoElement>(null), previewEnd = useRef<number | null>(null);
  const active = Boolean(project.job && activeJobStatuses.some((s) => s === project.job!.status));
  async function refresh() {
    if (demo) return;
    const response = await fetch(`/api/shorts/${project.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not refresh. Your edits are preserved; retry shortly.");
    const next: ShortsProjectView = await response.json();
    // Keep the version the unsaved draft was based on. Refresh must not silently
    // grant an old draft permission to overwrite another tab's newer edits.
    setProject((previous) => dirty ? { ...next, revision: previous.revision } : next);
    if (dirty && next.revision !== project.revision) setError("Clips changed in another tab. Your unsaved edits are preserved, but reload this page before saving to avoid overwriting newer work.");
    if (!dirty) { setPlan(next.plan); setSelected((ids) => ids.length ? ids : next.plan?.clips.map((c) => c.id) || []); }
  }
  useEffect(() => {
    if (demo || !active) return;
    const controller = new AbortController();
    let fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch(`/api/shorts/${initial.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not refresh progress. Use Refresh to retry.");
        const next: ShortsProjectView = await response.json();
        if (controller.signal.aborted) return;
        setProject((previous) => dirty ? { ...next, revision: previous.revision } : next);
        if (!dirty) { setPlan(next.plan); setSelected((ids) => ids.length ? ids : next.plan?.clips.map((c) => c.id) || []); }
      } catch { if (!controller.signal.aborted) setNotice("Connection interrupted. Your job continues in the background; refresh to reconnect."); }
      finally { fetching = false; }
    }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active, demo, dirty, initial.id]);
  function updateClip(id: string, update: Partial<ShortsClip>) { if (plan) { setPlan({ ...plan, clips: plan.clips.map((c) => c.id === id ? { ...c, ...update } : c) }); setDirty(true); } }
  function job(kind: "analyze" | "render") {
    if (demo) { setNotice("Sample only. No processing started and no credits charged."); return; }
    setError(""); startTransition(async () => {
      try {
        if (dirty) throw new Error("Save your clip edits before rendering.");
        const result = await startShortsJob(project.id, kind, project.revision, selected);
        if (result.error) setError(result.error);
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start processing."); }
    });
  }
  function save() {
    setError(""); startTransition(async () => {
      try {
        const checked = shortsPlanSchema.safeParse(plan);
        if (!checked.success) throw new Error(checked.error.issues[0]?.message || "Check your clip settings.");
        const parsed = checked.data; if (!project.analysis) return;
        validateShortsPlan(parsed, project.analysis);
        if (!demo) {
          const result = await saveShortsPlan(project.id, project.revision, parsed);
          if (result.error) throw new Error(result.error);
        }
        setProject((p) => ({ ...p, revision: p.revision + 1, plan: parsed, status: "ready", error: null })); setPlan(parsed); setDirty(false); setNotice(demo ? "Sample edits saved for this session only." : "Clip edits saved. You can now export your selected clips.");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save edits."); }
    });
  }
  const clip = plan?.clips.find((c) => c.id === focus) || plan?.clips[0];
  const words = project.analysis?.words || [], speakers = [...new Set(words.map((w) => w.speaker))];
  function preview() {
    if (!clip || !video.current) { setNotice("This is an illustrated sample editor, not a playable podcast recording."); return; }
    video.current.currentTime = clip.start; previewEnd.current = clip.end;
    void video.current.play().catch(() => setError("This browser cannot play the source. MP4 H.264/AAC is recommended."));
  }
  return <main className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/studio/shorts" className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="size-3" />All Shorts projects</Link><p className="eyebrow mt-6 text-primary">Shorts studio / {project.status}</p><h1 className="editorial mt-3 max-w-3xl text-3xl sm:text-5xl">{project.title}</h1></div><Button variant="outline" size="sm" disabled={pending || demo} onClick={() => { void refresh().catch((e) => setError(e.message)); }}><RefreshCw />Refresh</Button></div>
    <p className="mt-5 text-xs text-muted-foreground">01 · Upload & analyze <span className="mx-3">→</span>02 · Review your moments <span className="mx-3">→</span>03 · Export & post</p>
    {demo && <p className="mt-6 rounded-xl bg-accent/50 p-4 text-sm">Interactive sample — illustrative transcript, no real recording or generated results. Changes stay in this session. <Link className="text-primary underline" href="/login?next=/studio/shorts">Sign in to upload your video.</Link></p>}
    {(error || project.error) && <p role="alert" className="mt-6 rounded-xl border border-destructive/30 p-4 text-sm">{error || project.error} <Link className="text-primary underline" href="/studio/jobs">View jobs</Link></p>}
    {notice && <p role="status" className="mt-4 text-sm text-primary">{notice}</p>}
    {active && project.job && <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-accent/50 p-5"><LoaderCircle className="size-5 animate-spin text-primary" /><p className="flex-1 text-sm">{project.job.phase || "Waiting for the worker…"} You can leave and return later.</p><Button variant="outline" size="sm" disabled={pending || project.job.cancelRequested} onClick={() => job(project.plan ? "render" : "analyze")}>Reconnect job</Button><CancelJobButton jobId={project.job.id} title={project.title} requested={project.job.cancelRequested} onUpdate={() => { void refresh().catch(() => setError("Refresh to check cancellation.")); }} /></div>}
    {!plan && !active && <div className="mt-9 grid gap-8 lg:grid-cols-2"><div className="rounded-3xl border border-border bg-card p-8"><Scissors className="size-8 text-primary" /><h2 className="editorial mt-5 text-3xl">Find the moments worth keeping.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">We’ll check the file, transcribe its speech and suggest up to {project.brief.clipCount} clips. Then review the transcript, adjust the cuts and set your framing. Clear speech works best. Fewer clips may be suggested when there are not enough distinct moments.</p><Button className="mt-6" disabled={pending} onClick={() => job("analyze")}>Analyze video · {SHORTS_ANALYSIS_CREDITS} credits</Button><p className="mt-4 text-xs leading-6 text-muted-foreground">Analysis and rendering are separate charges. Failed or cancelled jobs return that stage’s reserved credits. Provider processing already in progress may not stop instantly.</p></div><ShortsPreview /></div>}
    {plan && clip && <div className="mt-8 grid items-start gap-6 lg:grid-cols-[240px_1fr_300px]">
      <aside className="space-y-3"><h2 className="mb-4 text-sm font-semibold">Your suggested moments</h2>{plan.clips.map((c) => <div key={c.id} className={`rounded-2xl border bg-card p-4 ${c.id === clip.id ? "border-primary" : "border-border"}`}><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(c.id)} disabled={active || pending} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id))} className="accent-primary" />Include in export</label><button type="button" onClick={() => setFocus(c.id)} className="mt-3 w-full text-left"><h3 className="text-sm font-semibold">{c.title}</h3><p className="mt-2 text-xs text-muted-foreground">{c.start.toFixed(1)}–{c.end.toFixed(1)}s · {(c.end - c.start).toFixed(1)}s</p></button></div>)}</aside>
      <section className="min-w-0 space-y-5"><div className="overflow-hidden rounded-2xl border border-border bg-[#10294d]">{project.sourceUrl ? <video ref={video} controls playsInline preload="metadata" src={project.sourceUrl} className="aspect-video w-full" aria-label="Original source video" onTimeUpdate={() => { if (video.current && previewEnd.current !== null && video.current.currentTime >= previewEnd.current) { video.current.pause(); previewEnd.current = null; } }} /> : <div className="p-5"><ShortsPreview /></div>}<div className="flex items-center justify-between gap-3 p-4 text-xs text-white"><span>Original source · export framing is applied by the worker</span><Button variant="secondary" size="sm" onClick={preview}><Play />Preview cut</Button></div></div>
      <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Why this moment?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{clip.reason}</p><details className="mt-5"><summary className="cursor-pointer text-sm text-primary">Review & correct caption words</summary><p className="mt-3 text-xs leading-6 text-muted-foreground">Edits change captions only, never the spoken audio. Check names and facts against the recording. Timestamps remain aligned to the original words.</p><div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-auto">{words.map((w, i) => ({ w, i })).filter(({ w }) => w.start < clip.end && w.end > clip.start).map(({ w, i }) => <label key={i} className="text-[9px] text-muted-foreground">{w.start.toFixed(1)}s · {w.speaker}<input aria-label={`Caption at ${w.start.toFixed(1)} seconds`} disabled={active || pending} value={plan.captionEdits[String(i)] ?? w.text} maxLength={80} size={Math.max(4, Math.min(16, (plan.captionEdits[String(i)] ?? w.text).length))} className="block rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" onChange={(e) => { setPlan({ ...plan, captionEdits: { ...plan.captionEdits, [String(i)]: e.target.value } }); setDirty(true); }} /></label>)}</div></details></div></section>
      <aside className="rounded-2xl border border-border bg-card p-5"><fieldset disabled={active || pending} className="min-w-0 space-y-5"><h2 className="font-semibold">Shape your Short</h2><label className="block text-xs font-semibold">Title<input className={shortsField} maxLength={100} value={clip.title} onChange={(e) => updateClip(clip.id, { title: e.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Start (seconds)<input className={shortsField} type="number" min={0} step={.1} value={clip.start} onChange={(e) => updateClip(clip.id, { start: Number(e.target.value) })} /></label><label className="text-xs font-semibold">End (seconds)<input className={shortsField} type="number" min={15} max={project.analysis?.duration} step={.1} value={clip.end} onChange={(e) => updateClip(clip.id, { end: Number(e.target.value) })} /></label></div><p className="text-xs text-muted-foreground">15–60 seconds per clip. Keep enough context to preserve the speaker’s meaning.</p>
      <label className="block text-xs font-semibold">Framing<select className={shortsField} value={clip.framing} onChange={(e) => updateClip(clip.id, { framing: e.target.value as ShortsClip["framing"] })}><option value="follow">Face-follow (assisted)</option><option value="manual">Manual crop</option><option value="fit">Fit all · blurred background</option></select></label>
      {clip.framing !== "fit" && <label className="block text-xs font-semibold">Crop anchor · {Math.round(clip.center * 100)}%<input aria-label="Crop anchor" className="mt-3 w-full accent-primary" type="range" min={0} max={1} step={.01} value={clip.center} onChange={(e) => updateClip(clip.id, { center: Number(e.target.value) })} /><span className="flex justify-between font-normal text-muted-foreground"><span>Left</span><span>Right</span></span></label>}
      {clip.framing === "follow" && <details><summary className="cursor-pointer text-xs font-semibold text-primary">Match voices to screen positions</summary><p className="mt-3 text-xs leading-6 text-muted-foreground">Listen to each voice in the source and set their horizontal position. Faces near that position are followed while that voice speaks. Without a match, your crop anchor is used. Overlap, profile faces and camera cuts need review.</p>{speakers.map((speaker) => <div key={speaker} className="mt-3"><button type="button" className="text-[10px] text-primary underline" onClick={() => { const word = words.find((w) => w.speaker === speaker); if (video.current && word) { video.current.currentTime = word.start; previewEnd.current = word.start + 5; void video.current.play().catch(() => setError("Could not preview this voice.")); } }}>{speaker} · listen</button><input aria-label={`Position for ${speaker}`} className="mt-2 w-full accent-primary" type="range" min={0} max={1} step={.01} value={plan.speakerPositions[speaker] ?? clip.center} onChange={(e) => { setPlan({ ...plan, speakerPositions: { ...plan.speakerPositions, [speaker]: Number(e.target.value) } }); setDirty(true); }} /></div>)}</details>}
      <label className="block text-xs font-semibold">Captions<select className={shortsField} value={clip.captions} onChange={(e) => updateClip(clip.id, { captions: e.target.value as ShortsClip["captions"] })}><option value="highlight">Animated word highlight</option><option value="clean">Clean captions</option><option value="none">No burned-in captions</option></select></label>
      <Button variant="outline" className="w-full" disabled={!dirty} onClick={save}><Save />Save edits</Button><Button className="w-full" disabled={dirty || !selected.length} onClick={() => job("render")}><Scissors />Export · {selected.length * SHORTS_RENDER_CREDITS} credits</Button><p className="text-[11px] leading-5 text-muted-foreground">{selected.length} selected · 720 × 1280 MP4 + SRT. Each new render is charged, including rerenders after an edit. Previous exports stay available until replaced by successful renders.</p>
      </fieldset></aside>
    </div>}
    {!!project.outputs.length && <section className="mt-12"><h2 className="editorial text-3xl">Ready for your final review.</h2><p className="mt-3 text-sm text-muted-foreground">Check cuts, caption accuracy and framing. Download, then publish on your platform; posting is not automatic.</p><div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{project.outputs.map((output) => <article key={output.id} className="overflow-hidden rounded-2xl border border-border bg-card"><video controls playsInline preload="none" className="aspect-[9/16] max-h-[480px] w-full bg-black" src={output.videoUrl} aria-label={output.title} /><div className="p-5"><h3 className="font-semibold">{output.title}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{output.framingNote}</p><p className="mt-2 text-xs text-muted-foreground">Source: {output.start.toFixed(1)}–{output.end.toFixed(1)}s</p><div className="mt-4 flex gap-3"><a href={output.downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline"><Download className="size-4" />MP4</a><a href={output.captionsUrl} className="text-sm text-primary underline">SRT captions</a></div></div></article>)}</div></section>}
  </main>;
}
