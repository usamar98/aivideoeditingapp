"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clapperboard, Film, ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createCartoonProject, createCartoonUpload } from "@/app/studio/cartoons/actions";
import { filmModels, filmLooks, filmModelIds, filmRenderCredits, FILM_PLAN_CREDITS, filmDurations, filmShotDurations, type FilmDuration, type FilmModel } from "@/lib/films/models";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/35";
const ideas = [
  ["The last light", "An elderly lighthouse keeper finds a tiny light inside a broken lantern. She carries it up the dark stairs and brings the lighthouse back to life."],
  ["A signal from home", "A lone astronaut tending a greenhouse on Mars discovers a flower that glows whenever a message arrives from Earth. Tonight, after years of silence, it blooms."],
  ["The unexpected guest", "A quiet clockmaker discovers a tiny paper bird nesting inside an old clock. Instead of chasing it away, she builds it a home from spare brass gears."],
];
const presets: {id:FilmModel;label:string;detail:string}[] = [
  {id:"film-kling-o3",label:"Character story",detail:"Recommended · cast references"},
  {id:"film-minimax-h3-turbo",label:"Budget first pass",detail:"MiniMax H3 Max Turbo"},
  {id:"film-veo-3.1",label:"Detailed scenes",detail:"Veo 3.1 · 1080p export"},
];

export function FilmCreator({demo,projects,initialError}:{demo:boolean;projects:{id:string;title:string;status:string}[];initialError:string|null}) {
  const router = useRouter();
  const [prompt,setPrompt] = useState("");
  const [look,setLook] = useState<keyof typeof filmLooks>("cinematic");
  const [duration,setDuration] = useState<FilmDuration>(60);
  const [aspect,setAspect] = useState<"16:9"|"9:16">("16:9");
  const [model,setModel] = useState<FilmModel>("film-kling-o3");
  const [audio,setAudio] = useState(true);
  const [rights,setRights] = useState(false);
  const [refs,setRefs] = useState<{id:string;name:string;file:File}[]>([]);
  const [error,setError] = useState(initialError || "");
  const [phase,setPhase] = useState("");
  const [pending,startTransition] = useTransition();
  const selected = filmModels[model], renderCost = filmRenderCredits(model,duration);
  function addImages(files:FileList|null) {
    if (!files) return;
    const next = Array.from(files);
    if (next.length + refs.length > 3 || next.some(f=>!["image/png","image/jpeg","image/webp"].includes(f.type) || f.size<=0 || f.size>8*1024*1024)) { setError("Use up to three PNG, JPG or WebP character images, 8 MB maximum each."); return; }
    setRefs(items=>[...items,...next.map((file,i)=>({id:crypto.randomUUID(),name:`Character ${items.length+i+1}`,file}))]); setError("");
  }
  function create() {
    if (demo || pending) return;
    setError("");
    startTransition(async()=>{
      try {
        const references:{assetId:string;name:string}[]=[];
        for (const [i,ref] of refs.entries()) {
          setPhase(`Uploading reference ${i+1}…`);
          const result = await createCartoonUpload({mime:ref.file.type,size:ref.file.size});
          if (result.error || !result.assetId || !result.path || !result.token) throw new Error(result.error || "Could not prepare the reference.");
          const db = createClient(); if (!db) throw new Error("Private storage is unavailable.");
          const uploaded = await db.storage.from("private-media").uploadToSignedUrl(result.path,result.token,ref.file,{contentType:ref.file.type});
          if (uploaded.error) throw new Error("Reference upload failed. Please try again.");
          references.push({assetId:result.assetId,name:ref.name});
        }
        setPhase("Saving your film…");
        const result = await createCartoonProject({kind:"short-film",prompt,style:look,duration,aspectRatio:aspect,model,resolution:selected.defaultResolution,audio,references,rightsConfirmed:rights});
        if (result.error || !result.id) throw new Error(result.error || "Could not save your film.");
        router.push(`/studio/films/${result.id}`);
      } catch(cause) { setError(cause instanceof Error ? cause.message : "Could not create your film."); }
      finally { setPhase(""); }
    });
  }
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">Short film studio / powered by fal</p><h1 className="editorial mt-3 text-4xl sm:text-6xl">A small story.<br/><span className="italic text-primary">A cinematic world.</span></h1><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">One idea, up to three minutes. Review your cast and story once; ETA directs the connected shots and assembles your film automatically.</p></div><Link href="/studio/films/demo" className="flex items-center gap-2 text-sm text-primary underline underline-offset-4">Explore a sample storyboard <ArrowRight className="size-4"/></Link></div>
    <ol className="my-8 flex flex-wrap gap-6 text-xs"><li className="text-primary">01 / Write the idea</li><li className="text-muted-foreground">02 / Direct the shots</li><li className="text-muted-foreground">03 / Render your film</li></ol>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent/40 p-4 text-sm">Interactive preview. No uploads or paid generation run here. <Link className="text-primary underline" href="/login?next=/studio/films">Sign in to create a film.</Link></p>}
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <form onSubmit={e=>{e.preventDefault();create();}} className="rounded-3xl border border-border bg-card p-5 sm:p-8">
        <fieldset disabled={pending} className="min-w-0 space-y-7">
          <div><label htmlFor="film-idea" className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary"/>What happens in your film?</label><textarea id="film-idea" required minLength={20} maxLength={2500} rows={5} className={`${field} leading-7`} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="A lighthouse keeper discovers a tiny light in a broken lantern. She…"/><div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>One protagonist, a clear goal, and an ending worth reaching.</span><span>{prompt.length}/2500</span></div><div className="mt-3 flex flex-wrap gap-2">{ideas.map(([label,idea])=><button type="button" key={label} onClick={()=>setPrompt(idea)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary">{label} ↗</button>)}</div></div>
          <div><p className="text-sm font-semibold" id="film-look-label">Choose the look</p><div role="group" aria-labelledby="film-look-label" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(filmLooks).map(([id,label])=><button key={id} type="button" aria-pressed={look===id} onClick={()=>setLook(id as keyof typeof filmLooks)} className={`rounded-xl border px-3 py-3 text-sm ${look===id?"border-primary bg-primary/5 text-primary":"border-border hover:bg-accent"}`}>{label}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-4"><label className="text-sm font-semibold">Film length<select className={field} value={duration} onChange={e=>setDuration(Number(e.target.value) as FilmDuration)}>{filmDurations.map(seconds => <option key={seconds} value={seconds}>{seconds >= 60 ? `${seconds / 60} minute${seconds > 60 ? "s" : ""}` : `${seconds} seconds`} · {filmShotDurations(seconds).length} shots</option>)}</select></label><label className="text-sm font-semibold">Canvas<select className={field} value={aspect} onChange={e=>setAspect(e.target.value as "16:9"|"9:16")}><option value="16:9">Landscape · 16:9</option><option value="9:16">Vertical · 9:16</option></select></label></div>
          <div><p id="film-model-label" className="text-sm font-semibold">Choose your production</p><div role="group" aria-labelledby="film-model-label" className="mt-3 grid gap-2 sm:grid-cols-3">{presets.map(p=><button key={p.id} type="button" aria-pressed={model===p.id} onClick={()=>setModel(p.id)} className={`rounded-xl border p-3 text-left ${model===p.id?"border-primary bg-primary/5":"border-border"}`}><span className="block text-sm font-semibold">{p.label}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{p.detail}</span></button>)}</div>
            <details className="mt-4 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm text-primary">All {filmModelIds.length} models & sound settings</summary><label className="mt-4 block text-xs font-semibold">Video model<select className={field} value={model} onChange={e=>setModel(e.target.value as FilmModel)}>{filmModelIds.map(id=><option key={id} value={id}>{filmModels[id].name} · {filmModels[id].defaultResolution} · {filmRenderCredits(id,duration)} render credits</option>)}</select></label><label className="mt-4 block text-xs font-semibold">Sound<select className={field} value={audio?"on":"off"} onChange={e=>setAudio(e.target.value==="on")}><option value="on">Native dialogue & ambience</option><option value="off">Silent film</option></select></label><p className="mt-3 text-xs leading-6 text-muted-foreground">Silent exports remove audio. Some models still generate audio internally; the credit price is unchanged. No model guarantees better results for every story.</p></details>
            <p className="mt-3 text-xs leading-6 text-muted-foreground"><strong className="text-foreground">{selected.name}</strong> · {selected.description} Export: {selected.defaultResolution}. Provider availability can vary.</p>
          </div>
          <details className="rounded-xl border border-dashed border-primary/30 p-4"><summary className="cursor-pointer text-sm font-semibold">Bring your own characters <span className="font-normal text-muted-foreground">· optional</span></summary><p className="mt-3 text-xs leading-6 text-muted-foreground">Up to three references, one character per image. Use original characters or adult likenesses you have permission to depict.</p><label className="mt-3 flex items-center gap-2 text-xs"><ImagePlus className="size-4"/>PNG / JPG / WebP · 8 MB each</label><input aria-label="Character reference images" className="mt-2 w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-accent file:p-2" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={demo||refs.length>=3} onChange={e=>{addImages(e.target.files);e.target.value="";}}/>{refs.map(ref=><div key={ref.id} className="mt-3 flex items-center gap-2"><label className="min-w-0 flex-1 text-xs"><span className="block truncate">{ref.file.name}</span><input aria-label={`Name for ${ref.file.name}`} required maxLength={40} value={ref.name} className={field} onChange={e=>setRefs(items=>items.map(r=>r.id===ref.id?{...r,name:e.target.value}:r))}/></label><button type="button" aria-label={`Remove ${ref.name}`} onClick={()=>setRefs(items=>items.filter(r=>r.id!==ref.id))}><X className="size-4"/></button></div>)}</details>
          <label className="flex items-start gap-3 text-xs leading-6 text-muted-foreground"><input type="checkbox" required checked={rights} onChange={e=>setRights(e.target.checked)} className="mt-1.5 accent-primary"/>I have the rights and consent to use this story and these images, including any adult likenesses. They will be sent to AI providers to make my film. No impersonation or deceptive endorsements.</label>
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={demo||pending||!rights||prompt.trim().length<20}>{pending?<LoaderCircle className="animate-spin"/>:<Clapperboard/>}{phase||"Create my film project"}<ArrowRight/></Button><p className="text-center text-xs text-muted-foreground">Saving is free. Approve each paid stage on the next screen.</p>
        </fieldset>
        {error&&<p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}
      </form>
      <aside className="space-y-5 lg:sticky lg:top-6"><div className="overflow-hidden rounded-3xl border border-border bg-card"><div className="relative bg-[#12202b] p-7 text-[#f4dfb8]"><div className="flex items-center justify-between text-[10px] uppercase tracking-[.2em]"><span>ETA / director’s notebook</span><Film className="size-5"/></div><div className="my-8 grid grid-cols-3 gap-2" aria-hidden>{["The setup","The turn","The resolve"].map((label,i)=><div key={label} className="flex aspect-[3/4] flex-col justify-end rounded-lg border border-white/20 bg-gradient-to-t from-black/50 to-[#9f8050]/20 p-2"><span className="font-mono text-xl opacity-60">0{i+1}</span><span className="mt-3 text-[10px]">{label}</span></div>)}</div><p className="text-[10px] uppercase tracking-widest text-white/60">Workflow illustration · not generated footage</p></div><div className="p-6"><p className="eyebrow text-primary">Your production estimate</p><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between gap-3"><dt>Cast & story</dt><dd>{FILM_PLAN_CREDITS} credits</dd></div><div className="flex justify-between gap-3"><dt>{filmShotDurations(duration).length} directed frames + film</dt><dd>{renderCost} credits</dd></div><div className="flex justify-between gap-3 border-t border-border pt-4 font-semibold"><dt>Complete production</dt><dd>{FILM_PLAN_CREDITS+renderCost} credits</dd></div></dl><p className="mt-5 text-xs leading-6 text-muted-foreground">Each stage requires approval. Completed planning stays charged. Failed or cancelled stages return their reserved credits. Rendering again is a new paid stage.</p></div></div><div className="rounded-2xl border border-border p-5"><h2 className="text-sm font-semibold">Built for a coherent story</h2>{["Fixed cast, wardrobe and world references","Story-state checks from setup to payoff","Location anchors and shot-to-shot visual memory","Private MP4 with full-runtime verification"].map(t=><p key={t} className="mt-4 flex gap-2 text-xs text-muted-foreground"><Check className="size-4 shrink-0 text-primary"/>{t}</p>)}<p className="mt-5 text-xs leading-6 text-muted-foreground">Long films use connected 6–8-second generations, not one continuous model call. References reduce drift but do not guarantee identical faces, voices or motion. Try 24 seconds first, then review before sharing.</p></div></aside>
    </div>
    {projects.length>0&&<section className="mt-12"><h2 className="editorial text-3xl">Your films in progress</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map(p=><Link key={p.id} href={`/studio/films/${p.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><span className="text-xs capitalize text-primary">{p.status}</span><h3 className="mt-3 font-semibold">{p.title}</h3><p className="mt-5 text-xs text-muted-foreground">Return to the director’s desk →</p></Link>)}</div></section>}
  </main>;
}
