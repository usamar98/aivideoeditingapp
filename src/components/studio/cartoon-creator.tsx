"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clapperboard, ImagePlus, LoaderCircle, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createCartoonProject, createCartoonUpload } from "@/app/studio/cartoons/actions";
import { cartoonPlanCredits, isDirectCartoonModel, isSeedanceModel, cartoonModels, cartoonRenderCredits, cartoonStyles, type CartoonBrief } from "@/lib/cartoons/schema";

const ideas = ["A tiny fox astronaut and a nervous robot discover that the moon is made of marshmallow. They argue about taking a bite, then share a laugh.", "A young dragon opens a bakery, but sneezes fire every time someone orders ice cream. A clever rabbit helps save opening day.", "Two clay penguins build a flying machine from kitchen utensils. Their first flight ends in a spectacular pancake landing."];
const field = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/35";

export function CartoonCreator({ demo, seedanceEnabled, projects, initialError }: {
  demo: boolean; seedanceEnabled: boolean; projects: { id: string; title: string; status: string }[]; initialError: string | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<CartoonBrief["style"]>("3d");
  const [duration, setDuration] = useState<CartoonBrief["duration"]>(15);
  const [aspectRatio, setAspect] = useState<CartoonBrief["aspectRatio"]>("16:9");
  const [model, setModel] = useState<CartoonBrief["model"]>("kling-o3");
  const [resolution, setResolution] = useState<NonNullable<CartoonBrief["resolution"]>>("720p");
  const [audio, setAudio] = useState(true);
  const direct = isDirectCartoonModel(model);
  const quote = { model, duration, resolution, audio };
  const [references, setReferences] = useState<{ id: string; file: File; name: string }[]>([]);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState("");
  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    if (references.length + next.length > 3) { setError("Upload up to three characters, one image for each."); return; }
    if (next.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0)) { setError("Use PNG, JPG or WebP images up to 8 MB each."); return; }
    setReferences((current) => [...current, ...next.map((file, i) => ({ id: crypto.randomUUID(), file, name: `Character ${current.length + i + 1}` }))]); setError("");
  }
  function create() {
    if (demo) return;
    if (direct && references.length) { setError("Remove the character images or select a character-reference model."); return; }
    setError("");
    startTransition(async () => {
      try {
        const uploads: CartoonBrief["references"] = [];
        for (const [i, reference] of references.entries()) {
          setPhase(`Uploading character ${i + 1}…`);
          const prepared = await createCartoonUpload({ mime: reference.file.type, size: reference.file.size });
          if (prepared.error || !prepared.assetId || !prepared.path || !prepared.token) throw new Error(prepared.error || "Upload could not start.");
          const db = createClient(); if (!db) throw new Error("Storage is not connected.");
          const uploaded = await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, reference.file, { contentType: reference.file.type });
          if (uploaded.error) throw new Error("Character upload failed. Please retry.");
          uploads.push({ assetId: prepared.assetId, name: reference.name });
        }
        setPhase("Saving your story idea…");
        const result = await createCartoonProject({ prompt, style, duration, aspectRatio, model, resolution, audio, references: uploads, rightsConfirmed: rights });
        if (result.error || !result.id) throw new Error(result.error || "Could not create project.");
        router.push(`/studio/cartoons/${result.id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the cartoon."); }
      finally { setPhase(""); }
    });
  }
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">Cartoon studio / powered by fal</p><h1 className="editorial mt-3 text-4xl sm:text-6xl">Give your imagination<br /><span className="italic text-primary">a speaking part.</span></h1><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">An idea becomes a cast. A cast becomes a story. Turn your prompt—or your own character art—into a short animated film with actions and dialogue.</p></div><span className="rounded-full border border-primary/20 bg-accent/50 px-4 py-2 text-xs text-primary">{direct ? "Prompt → Story review → Direct animation" : "Prompt → Cast & story → Animated film"}</span></div>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent/40 p-4 text-sm">Studio preview. No uploads or paid generation run here. <Link href="/login?next=/studio/cartoons" className="font-semibold text-primary underline">Sign in to create</Link>, or <Link href="/studio/cartoons/demo" className="text-primary underline">explore a sample storyboard</Link>.</p>}
    <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_1fr]">
      <form className="rounded-3xl border border-border bg-card p-5 sm:p-8" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <fieldset disabled={pending} className="min-w-0 space-y-7">
          <div><label htmlFor="cartoon-prompt" className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-primary" /> What happens in your cartoon?</label><textarea id="cartoon-prompt" required minLength={20} maxLength={2500} rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={`${field} resize-y leading-7`} placeholder="A tiny fox astronaut and a nervous robot discover a very unusual moon. The fox says…" /><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Include characters, a setting, an adventure, or an exact line.</span><span>{prompt.length}/2500</span></div><div className="mt-3 flex flex-wrap gap-2">{["A marshmallow moon", "The dragon bakery", "Penguins take flight"].map((label, i) => <button key={label} type="button" onClick={() => setPrompt(ideas[i])} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary">{label} ↗</button>)}</div></div>
          <div><p className="text-sm font-semibold">Art direction</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(cartoonStyles).map(([key, label]) => <button type="button" key={key} aria-pressed={style === key} onClick={() => setStyle(key as CartoonBrief["style"])} className={`rounded-xl border px-3 py-4 text-sm transition-colors ${style === key ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-accent"}`}>{label}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-4"><label className="text-sm font-semibold">Film length<select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value) as CartoonBrief["duration"])}>{[15, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label><label className="text-sm font-semibold">Canvas<select className={field} value={aspectRatio} onChange={(e) => setAspect(e.target.value as CartoonBrief["aspectRatio"])}><option value="16:9">Landscape · 16:9</option><option value="9:16">Vertical · 9:16</option></select></label></div>
          <div><label className="text-sm font-semibold" htmlFor="cartoon-model">Animation model</label><select id="cartoon-model" value={model} onChange={(e) => { const next = e.target.value as CartoonBrief["model"]; setModel(next); setResolution(cartoonModels[next].defaultResolution); setAudio(true); }} className={field}>{Object.entries(cartoonModels).map(([key, item]) => <option key={key} value={key} disabled={isSeedanceModel(key as CartoonBrief["model"]) && !seedanceEnabled}>{item.name}{isSeedanceModel(key as CartoonBrief["model"]) && !seedanceEnabled ? " · access not enabled" : ""}</option>)}</select><p className="mt-2 text-xs leading-5 text-muted-foreground">{cartoonModels[model].description}. {direct ? "No character portraits or scene images are generated. Review the story first, then animate directly from text. Character continuity may vary between scenes." : "Character art uses GPT Image 2.5 Sunburst. Finished films are 720p with English speech."}</p></div>
          <div className="grid grid-cols-2 gap-4"><label className="text-sm font-semibold">Output resolution<select className={field} value={resolution} onChange={(e) => setResolution(e.target.value as NonNullable<CartoonBrief["resolution"]>)}>{cartoonModels[model].resolutions.map((value) => <option key={value} value={value}>{value}{model === "kling-v3" ? " export · model-native source" : ""}</option>)}</select></label>{model === "kling-v3" && <label className="text-sm font-semibold">Sound<select className={field} value={audio ? "on" : "off"} onChange={(e) => setAudio(e.target.value === "on")}><option value="on">Dialogue & sound</option><option value="off">Silent video</option></select></label>}</div>
          {direct && <p className="rounded-xl bg-accent/50 p-3 text-xs leading-6">Direct prompt mode does not use uploaded character images. {references.length > 0 ? "Remove the images below before continuing, or switch back to a reference model." : "Choose a character-reference model to upload your own cast."}</p>}
          {(!direct || references.length > 0) && <div className="rounded-2xl border border-dashed border-primary/25 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Bring your own cast <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-xs leading-5 text-muted-foreground">One clear character per image. We preserve its appearance and adapt it to your art direction.</p></div><ImagePlus className="size-6 shrink-0 text-primary" /></div><label className="mt-4 block text-xs font-medium">Add character images · PNG/JPG/WebP · max 8 MB each<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={demo || direct || references.length >= 3 || pending} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-primary" /></label>{references.map((ref) => <div key={ref.id} className="mt-3 flex items-center gap-3 rounded-xl bg-background p-3"><Users className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><label className="sr-only" htmlFor={`name-${ref.id}`}>Character name</label><input id={`name-${ref.id}`} aria-label={`Name for ${ref.file.name}`} required maxLength={40} value={ref.name} onChange={(e) => setReferences((items) => items.map((item) => item.id === ref.id ? { ...item, name: e.target.value } : item))} className="w-full bg-transparent text-sm font-medium outline-none focus:ring-2 focus:ring-primary" /><p className="truncate text-xs text-muted-foreground">{ref.file.name}</p></div><button type="button" aria-label={`Remove ${ref.name}`} onClick={() => setReferences((items) => items.filter((item) => item.id !== ref.id))}><X className="size-4" /></button></div>)}</div>}
          <label className="flex items-start gap-3 text-xs leading-6 text-muted-foreground"><input type="checkbox" required checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1.5 accent-primary" />I have permission to use these characters and images. My prompt and references will be sent to AI providers to create this film.</label>
          <div className="border-t border-border pt-5"><div className="mb-4 flex flex-wrap justify-between gap-2 text-xs"><span>{direct ? "Story" : "Cast & story"}: <strong>{cartoonPlanCredits(quote)} credits</strong></span><span>Animation: <strong>{cartoonRenderCredits(quote)} credits</strong></span></div><Button type="submit" size="lg" disabled={demo || pending || !rights || prompt.trim().length < 20 || (direct && references.length > 0)} className="w-full rounded-xl">{pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{phase || "Build my cartoon"}<ArrowRight /></Button><p className="mt-3 text-center text-xs text-muted-foreground">Saving is free. Confirm credits on the next screen.</p></div>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}
      </form>
      <aside className="space-y-5"><div className="overflow-hidden rounded-3xl border border-border bg-card"><div className="relative aspect-[4/3]"><Image src="/demo/weather-workshop.png" alt="Illustrative cartoon scene with two characters in a whimsical workshop" fill sizes="(max-width:1024px) 100vw, 40vw" className="object-cover" /><span className="absolute left-4 top-4 rounded-full bg-card/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest">Illustrative sample · not a live output</span></div><div className="p-6"><p className="eyebrow text-primary">You direct. AI brings it to life.</p><h2 className="editorial mt-3 text-3xl">A little world,<br />all your own.</h2><div className="mt-6 space-y-5">{[["01", "Meet your cast", direct ? "AI writes consistent character descriptions. No portraits are generated in direct-prompt mode." : "AI designs up to three characters, using your uploads when provided."], ["02", "Shape the story", "Review the cast and edit each scene’s action, camera and spoken lines."], ["03", "Let it move", audio ? "Animate with native dialogue and sound, then download your private MP4." : "Create silent animation, then download your private MP4."]].map(([number, title, description]) => <div key={number} className="flex gap-4"><span className="font-mono text-xs text-primary">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p></div></div>)}</div></div></div><p className="px-2 text-xs leading-6 text-muted-foreground">AI character consistency, exact dialogue and lip sync can vary. Review the result before publishing. This creates video—not editable 3D rigs. Rendering can take several minutes; you can leave and return.</p></aside>
    </div>
    {projects.length > 0 && <section className="mt-14"><div className="flex items-center gap-3"><Clapperboard className="size-5 text-primary" /><h2 className="text-xl font-semibold">Your cartoon projects</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/studio/cartoons/${project.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><span className="text-xs capitalize text-primary">{project.status}</span><h3 className="mt-3 font-semibold">{project.title}</h3><p className="mt-5 text-xs text-muted-foreground">Continue directing →</p></Link>)}</div></section>}
  </main>;
}
