"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Download, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelJobButton } from "./cancel-job-button";
import { saveCartoonStory, startCartoonJob } from "@/app/studio/cartoons/actions";
import { CARTOON_PLAN_CREDITS, cartoonModels, cartoonRenderCredits, cartoonStyles, type CartoonProjectView, type CartoonScene, type CartoonStory } from "@/lib/cartoons/schema";

const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal leading-6 outline-none focus:ring-2 focus:ring-primary/35";

export function CartoonEditor({ initial, demo }: { initial: CartoonProjectView; demo: boolean }) {
  const [project, setProject] = useState(initial);
  const [story, setStory] = useState(initial.storyboard);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = ["planning", "rendering"].includes(project.status);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (demo) return;
    const response = await fetch(`/api/cartoons/${initial.id}`, { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not refresh the cartoon.");
    setProject(data as CartoonProjectView);
    if (!dirtyRef.current) setStory((data as CartoonProjectView).storyboard);
  }, [demo, initial.id]);
  useEffect(() => {
    if (demo || !busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { if (document.visibilityState !== "hidden") await refresh(controller.signal); }
      catch { if (!controller.signal.aborted) setError("Connection interrupted. Your job continues in the background. Refresh to reconnect."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 5000); }
    }
    timer = setTimeout(poll, 3000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [busy, demo, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(next: CartoonStory) { dirtyRef.current = true; setDirty(true); setStory(next); }
  function sceneEdit(index: number, changes: Partial<CartoonScene>) {
    if (story) edit({ ...story, scenes: story.scenes.map((scene, i) => i === index ? { ...scene, ...changes } : scene) });
  }
  function move(index: number, direction: number) {
    if (!story) return;
    const scenes = [...story.scenes]; [scenes[index], scenes[index + direction]] = [scenes[index + direction], scenes[index]];
    edit({ ...story, scenes });
  }
  function run(action: "save" | "plan" | "render" | "refresh") {
    if (demo) return;
    setError("");
    startTransition(async () => {
      try {
        if ((action === "save" || action === "render") && dirtyRef.current && story) {
          const saved = await saveCartoonStory(project.id, story);
          if (saved.error) throw new Error(saved.error);
          dirtyRef.current = false; setDirty(false);
        }
        if (action === "plan" || action === "render") {
          const started = await startCartoonJob(project.id, action);
          await refresh();
          if (started.error) throw new Error(started.error);
        } else await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the project."); }
    });
  }
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-primary">Cartoon studio / {project.status}</p><h1 className="editorial mt-3 max-w-3xl text-4xl sm:text-5xl">{project.title}</h1><p className="mt-4 text-sm text-muted-foreground">{cartoonStyles[project.brief.style]} · {project.brief.duration}s · {project.brief.aspectRatio} · {cartoonModels[project.brief.model].name}</p></div><div className="flex gap-2"><Button variant="outline" disabled={demo || pending} onClick={() => run("refresh")} aria-label="Refresh cartoon"><RefreshCw /></Button><Button asChild variant="outline"><Link href={demo ? "/studio/cartoons?preview=1" : "/studio/cartoons"}>New cartoon <Plus /></Link></Button></div></div>
    <ol className="my-8 flex flex-wrap gap-5 text-xs text-muted-foreground"><li className="text-primary">01 · Your idea</li><li className={story ? "text-primary" : ""}>02 · Cast & storyboard</li><li className={project.outputUrl ? "text-primary" : ""}>03 · Animate & download</li></ol>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent/40 p-4 text-sm">Sample storyboard, not generated output. Try editing the scenes; saving and paid generation are disabled in this preview.</p>}
    {(error || project.error) && <p role="alert" className="mb-6 rounded-xl border border-destructive/25 p-4 text-sm leading-6">{error || project.error} <Link href="/studio/jobs" className="text-primary underline">View jobs</Link></p>}
    {busy && <section role="status" className="mb-7 rounded-2xl border border-primary/15 bg-accent/60 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-3 text-sm font-medium"><LoaderCircle className="size-4 animate-spin text-primary" />{project.job?.cancelRequested ? "Stopping your cartoon job…" : project.job?.phase || "Waiting for the animation worker…"}</p><p className="mt-3 text-xs leading-6 text-muted-foreground">Your progress is saved. You can leave this page and return. Credits stay reserved until the job finishes or cancellation is confirmed.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={pending || Boolean(project.job?.cancelRequested)} onClick={() => run(project.status === "planning" ? "plan" : "render")}>Reconnect job</Button>{project.job && <CancelJobButton jobId={project.job.id} title={project.title} requested={project.job.cancelRequested} onUpdate={refresh} />}</div></div></section>}
    {!story && <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-3xl border border-border bg-card p-7"><Sparkles className="size-8 text-primary" /><h2 className="editorial mt-5 text-3xl">Let’s meet your characters.</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{project.brief.prompt}</p>{project.brief.references.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Your references: {project.brief.references.map((r) => r.name).join(", ")}</p>}<p className="mt-6 text-sm leading-7 text-muted-foreground">AI will write your story, define each character, and create polished reference portraits. You’ll review the cast and edit the scenes before any animation starts.</p><Button size="lg" className="mt-6" disabled={demo || pending || busy} onClick={() => run("plan")}>{pending ? <LoaderCircle className="animate-spin" /> : <Users />}Create cast & story · {CARTOON_PLAN_CREDITS} credits</Button></section><aside className="rounded-3xl border border-primary/20 bg-accent/30 p-7"><p className="eyebrow text-primary">Your production estimate</p><div className="mt-5 space-y-4 text-sm"><p className="flex justify-between"><span>Cast & editable story</span><strong>{CARTOON_PLAN_CREDITS} credits</strong></p><p className="flex justify-between"><span>{project.brief.duration}s animation</span><strong>{cartoonRenderCredits(project.brief)} credits</strong></p><p className="flex justify-between border-t border-border pt-4"><span>Complete film</span><strong>{CARTOON_PLAN_CREDITS + cartoonRenderCredits(project.brief)} credits</strong></p></div><p className="mt-6 text-xs leading-6 text-muted-foreground">Each stage requires your confirmation. Failed or cancelled jobs return that stage’s reserved credits. Successfully completed cast design remains charged even if you choose not to animate.</p></aside></div>}
    {story && <>
      <section className="mb-8 rounded-3xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow text-primary">Character bible</p><h2 className="mt-2 text-xl font-semibold">Meet your cast</h2></div><span className="rounded-full bg-accent px-3 py-1.5 text-xs text-primary">Locked references · reused in every scene</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{story.characters.map((character) => <article key={character.id} className="overflow-hidden rounded-2xl border border-border"><div className="relative aspect-square bg-accent/35">{project.castUrls[character.id] ? <Image src={project.castUrls[character.id]} alt={`Approved reference portrait of ${character.name}`} fill unoptimized sizes="(max-width:640px) 100vw, 30vw" className="object-contain" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Users className="size-10 text-primary/40" /><p className="text-xs">{demo ? "Sample character · no generated portrait" : "Portrait unavailable—refresh to retry"}</p></div>}</div><div className="p-4"><h3 className="font-semibold">{character.name}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{character.appearance}</p><p className="mt-3 text-xs"><span className="text-primary">Voice direction:</span> {character.voice}</p><p className="mt-2 text-xs text-muted-foreground">{character.referenceSlot ? "Adapted from your uploaded artwork" : "Created from your prompt"}</p></div></article>)}</div></section>
      <fieldset disabled={busy || pending} className="min-w-0"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary">Director’s desk</p><h2 className="editorial mt-2 text-3xl">Shape every moment.</h2><p className="mt-2 text-xs text-muted-foreground">Keep lines short for natural speech. Characters and total runtime stay locked.</p></div><Button variant="outline" disabled={demo || !dirty} onClick={() => run("save")}><Save />{dirty ? "Save changes" : "Story saved"}</Button></div><label className="mb-6 block text-xs font-semibold">Film title<input maxLength={100} value={story.title} className={field} onChange={(e) => edit({ ...story, title: e.target.value })} /></label>
        <div className="space-y-5">{story.scenes.map((scene, index) => <article key={index} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span><div><h3 className="text-sm font-semibold">{scene.title}</h3><p className="mt-1 text-xs text-muted-foreground">{scene.duration} seconds · {scene.characterIds.map((id) => story.characters.find((c) => c.id === id)?.name).join(" + ")}</p></div></div><div className="flex gap-1"><Button variant="ghost" size="sm" aria-label={`Move scene ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="sm" aria-label={`Move scene ${index + 1} down`} disabled={index === story.scenes.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></div></div><div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold">Setting<textarea rows={2} maxLength={500} value={scene.setting} onChange={(e) => sceneEdit(index, { setting: e.target.value })} className={field} /></label><label className="text-xs font-semibold">Action<textarea rows={2} maxLength={700} value={scene.action} onChange={(e) => sceneEdit(index, { action: e.target.value })} className={field} /></label><label className="text-xs font-semibold">Camera<input maxLength={200} value={scene.camera} onChange={(e) => sceneEdit(index, { camera: e.target.value })} className={field} /></label><label className="text-xs font-semibold">Sound direction<input maxLength={200} value={scene.sound} onChange={(e) => sceneEdit(index, { sound: e.target.value })} className={field} /></label></div><div className="mt-5 border-t border-border pt-4"><p className="text-xs font-semibold text-primary">Spoken dialogue <span className="font-normal text-muted-foreground">· up to {scene.duration * 2} words total</span></p>{scene.dialogue.map((line, lineIndex) => <div key={lineIndex} className="mt-3 flex flex-wrap items-start gap-2"><select aria-label={`Scene ${index + 1}, line ${lineIndex + 1} speaker`} className="rounded-lg border border-border bg-background px-3 py-2 text-xs" value={line.characterId} onChange={(e) => sceneEdit(index, { dialogue: scene.dialogue.map((l, i) => i === lineIndex ? { ...l, characterId: e.target.value } : l) })}>{scene.characterIds.map((id) => <option key={id} value={id}>{story.characters.find((c) => c.id === id)?.name}</option>)}</select><input aria-label={`Scene ${index + 1}, line ${lineIndex + 1} dialogue`} maxLength={180} value={line.text} className="min-w-[160px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/35" onChange={(e) => sceneEdit(index, { dialogue: scene.dialogue.map((l, i) => i === lineIndex ? { ...l, text: e.target.value } : l) })} /><Button variant="ghost" size="sm" aria-label={`Remove scene ${index + 1}, line ${lineIndex + 1}`} onClick={() => sceneEdit(index, { dialogue: scene.dialogue.filter((_, i) => i !== lineIndex) })}><X /></Button></div>)}{scene.dialogue.length < 2 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => sceneEdit(index, { dialogue: [...scene.dialogue, { characterId: scene.characterIds[0], text: "A new adventure begins!" }] })}><Plus />Add spoken line</Button>}</div></article>)}</div>
      </fieldset>
      <section className="mt-7 rounded-2xl border border-primary/20 bg-accent/35 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-5"><div><h2 className="text-lg font-semibold">Ready for their first performance?</h2><p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">{project.brief.duration}s of animation, English dialogue and sound. {dirty ? "Your edits will be saved before rendering." : "Review your cast and storyboard before continuing."} Each render costs {cartoonRenderCredits(project.brief)} credits. AI speech and identity consistency can vary.</p></div><Button size="lg" disabled={demo || pending || busy} onClick={() => run("render")}>{pending ? <LoaderCircle className="animate-spin" /> : <Clapperboard />}Animate film · {cartoonRenderCredits(project.brief)} credits</Button></div></section>
    </>}
    {project.outputUrl && <section className="mt-10 rounded-3xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="editorial text-3xl">Your film is ready.</h2><Button asChild variant="outline"><a href={project.outputUrl} target="_blank" rel="noreferrer" download><Download />Open / download MP4</a></Button></div><video controls playsInline preload="metadata" src={project.outputUrl} className="mx-auto max-h-[70vh] w-full rounded-2xl bg-foreground" /><p className="mt-3 text-xs text-muted-foreground">Private preview links expire after 15 minutes. Use Refresh above for a new link.</p></section>}
  </main>;
}
