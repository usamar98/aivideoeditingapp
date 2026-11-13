"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Clapperboard, LoaderCircle, Monitor, SlidersHorizontal, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { createCartoonProject, createCartoonUpload } from "@/app/studio/cartoons/actions";
import { isFilmModel } from "@/lib/films/models";
import { cartoonModels, cartoonPlanCredits, cartoonRenderCredits, isDirectCartoonModel, isSeedanceModel, supportsCartoonAudioToggle, type CartoonBrief } from "@/lib/cartoons/schema";
import { CartoonStyleGallery } from "./cartoon-style-gallery";

const field = "mt-2 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm font-normal text-foreground focus-visible:outline-2 focus-visible:outline-primary";
const formatOptions = [
  { value: "16:9", label: "Landscape", icon: Monitor },
  { value: "9:16", label: "Portrait", icon: Smartphone },
] as const;
const modelOptions = (Object.keys(cartoonModels) as CartoonBrief["model"][]).filter((key) => !isFilmModel(key));
const storyExample = 'A fox and her robot land on a marshmallow moon. Nova: "One small bite?" Bolt catches her bouncing helmet. Bolt: "Save some for the trip home!"';

type CharacterReference = { id: string; file: File; name: string };

export function CartoonCreator({ demo, seedanceEnabled, projects, initialError }: {
  demo: boolean;
  seedanceEnabled: boolean;
  projects: { id: string; title: string; status: string }[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<CartoonBrief["style"]>("3d");
  const [duration, setDuration] = useState<CartoonBrief["duration"]>(15);
  const [aspectRatio, setAspectRatio] = useState<CartoonBrief["aspectRatio"]>("16:9");
  const [model, setModel] = useState<CartoonBrief["model"]>("kling-o3");
  const [resolution, setResolution] = useState<NonNullable<CartoonBrief["resolution"]>>(cartoonModels["kling-o3"].defaultResolution);
  const [audio, setAudio] = useState(true);
  const [references, setReferences] = useState<CharacterReference[]>([]);
  const [castOpen, setCastOpen] = useState(false);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState("");
  const direct = isDirectCartoonModel(model);
  const portrait = aspectRatio === "9:16";
  const examplePath = portrait ? "/examples/cartoon-story-portrait" : "/examples/cartoon-story";
  const quote = { model, duration, resolution, audio };

  function addFiles(files: FileList | null) {
    const next = Array.from(files ?? []);
    if (references.length + next.length > 3) {
      setError("Choose up to three character images.");
      return;
    }
    if (next.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0)) {
      setError("Use JPG, PNG or WebP images up to 8 MB each.");
      return;
    }
    setError("");
    setReferences((current) => [...current, ...next.map((file, i) => ({
      id: crypto.randomUUID(), file, name: `Character ${current.length + i + 1}`,
    }))]);
  }

  function selectModel(next: CartoonBrief["model"]) {
    setModel(next);
    setResolution(cartoonModels[next].defaultResolution);
    setAudio(true);
    if (references.length && isDirectCartoonModel(next)) setCastOpen(true);
    setError("");
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || pending) return;
    if (direct && references.length) {
      setError("Remove the character images or choose a model that takes character references.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const uploads: CartoonBrief["references"] = [];
        const db = references.length ? createClient() : null;
        for (const [i, reference] of references.entries()) {
          if (!db) throw new Error("Storage is not connected.");
          setPhase(`Uploading character ${i + 1}…`);
          const prepared = await createCartoonUpload({ mime: reference.file.type, size: reference.file.size });
          if (prepared.error || !prepared.assetId || !prepared.path || !prepared.token) throw new Error(prepared.error || "Upload could not start.");
          const uploaded = await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, reference.file, { contentType: reference.file.type });
          if (uploaded.error) throw new Error("Character upload failed. Please retry.");
          uploads.push({ assetId: prepared.assetId, name: reference.name });
        }
        setPhase("Saving cartoon…");
        const result = await createCartoonProject({ prompt, style, duration, aspectRatio, model, resolution, audio, references: uploads, rightsConfirmed: rights });
        if (result.error || !result.id) throw new Error(result.error || "Could not create the cartoon.");
        router.push(`/studio/cartoons/${result.id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the cartoon.");
      } finally {
        setPhase("");
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-11">
      <header className="mb-7">
        <h1 className="editorial text-[clamp(2.45rem,5vw,4rem)] leading-[1.04] tracking-[-.045em]">Cartoon video studio</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Write a story, choose its look, then review the cast and dialogue before animating.</p>
      </header>

      <form onSubmit={create} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.44fr)_minmax(290px,1fr)]">
        <Card className="min-w-0 gap-0 rounded-2xl p-5 sm:p-7">
          <fieldset disabled={pending} className="min-w-0">
            <label htmlFor="cartoon-prompt" className="text-lg font-semibold tracking-tight">Your idea or script</label>
            <Textarea id="cartoon-prompt" required minLength={20} maxLength={2500} rows={4}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-describedby="cartoon-prompt-help"
              className="mt-3 min-h-32 resize-y rounded-xl bg-background/60 p-4 text-base leading-6"
              placeholder="Describe your cartoon or paste a script with character names and dialogue." />
            <div className="mt-2 flex items-start justify-between gap-3 text-xs leading-5 text-muted-foreground">
              <span id="cartoon-prompt-help">Include the setting, characters and what they say.</span>
              <span className="shrink-0 tabular-nums">{prompt.length} / 2,500</span>
            </div>
            {prompt.length === 0 && <button type="button" onClick={() => setPrompt(storyExample)} className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-primary">Use an example story</button>}

            <div className="mt-5 border-t border-border pt-5">
              <CartoonStyleGallery value={style} onChange={setStyle} disabled={pending} />
            </div>
            <fieldset className="mt-5 min-w-0">
              <legend className="text-sm font-semibold">Film length</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {([15, 30, 60] as const).map((seconds) => <label key={seconds} className="relative cursor-pointer">
                  <input className="peer sr-only" type="radio" name="cartoon-duration" value={seconds} checked={duration === seconds} onChange={() => setDuration(seconds)} />
                  <span className="block rounded-lg border border-border px-3.5 py-2 text-sm peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{seconds} seconds</span>
                </label>)}
              </div>
            </fieldset>

            <details className="group mt-5 border-t border-border">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm pt-4 text-sm font-semibold focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" /> Animation settings
                <ChevronDown aria-hidden className="ml-auto size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="cartoon-model" className="text-sm font-semibold">Animation model</label>
                  <select id="cartoon-model" className={field} value={model} onChange={(e) => selectModel(e.target.value as CartoonBrief["model"])}>
                    {modelOptions.map((key) => {
                      const unavailable = isSeedanceModel(key) && !seedanceEnabled;
                      return <option key={key} value={key} disabled={unavailable}>{cartoonModels[key].name}{unavailable ? " · access required" : ""}</option>;
                    })}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{cartoonModels[model].description}.</p>
                </div>
                <div className="grid gap-3 min-[400px]:grid-cols-2">
                  <div>
                    <label htmlFor="cartoon-resolution" className="text-sm font-semibold">Export resolution</label>
                    <select id="cartoon-resolution" className={field} value={resolution} onChange={(e) => setResolution(e.target.value as NonNullable<CartoonBrief["resolution"]>)}>
                      {cartoonModels[model].resolutions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  {supportsCartoonAudioToggle(model) && <div>
                    <label htmlFor="cartoon-sound" className="text-sm font-semibold">Sound</label>
                    <select id="cartoon-sound" className={field} value={audio ? "on" : "off"} onChange={(e) => setAudio(e.target.value === "on")}>
                      <option value="on">Dialogue and sound</option><option value="off">Silent video</option>
                    </select>
                  </div>}
                </div>
              </div>
            </details>
            {(!direct || references.length > 0) && <details className="group mt-4 border-t border-border" open={castOpen} onToggle={(e) => setCastOpen(e.currentTarget.open)}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm pt-4 text-sm font-semibold focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                Character images <span className="font-normal text-muted-foreground">{references.length ? `(${references.length} of 3)` : "(optional)"}</span>
                <ChevronDown aria-hidden className="ml-auto size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3">
                <label htmlFor="cartoon-characters" className="text-xs leading-5 text-muted-foreground">{direct ? "Choose a character-reference model or remove your images." : "Add up to three characters, one per image. JPG, PNG or WebP, up to 8 MB each."}</label>
                <input id="cartoon-characters" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={demo || direct || references.length >= 3}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                  className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-primary" />
                {references.map((reference) => <div key={reference.id} className="mt-2 flex items-center gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <input aria-label={`Name for ${reference.file.name}`} required maxLength={40} value={reference.name}
                      onChange={(e) => setReferences((items) => items.map((item) => item.id === reference.id ? { ...item, name: e.target.value } : item))}
                      className="w-full bg-transparent text-sm font-medium focus-visible:outline-primary" />
                    <p className="truncate text-xs text-muted-foreground">{reference.file.name}</p>
                  </div>
                  <button type="button" aria-label={`Remove ${reference.name}`} onClick={() => setReferences((items) => items.filter((item) => item.id !== reference.id))} className="rounded-md p-2 hover:bg-accent"><X className="size-4" /></button>
                </div>)}
              </div>
            </details>}
          </fieldset>
        </Card>

        <Card className="min-w-0 gap-0 rounded-2xl p-5 sm:p-6 lg:sticky lg:top-6 lg:row-span-2">
          <fieldset disabled={pending}>
            <legend className="text-lg font-semibold tracking-tight">Video format</legend>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
              {formatOptions.map(({ value, label, icon: Icon }) => <label key={value} className="relative min-w-0 cursor-pointer">
                <input type="radio" name="cartoon-format" className="peer sr-only" value={value} checked={aspectRatio === value} onChange={() => setAspectRatio(value)} />
                <span className="flex min-h-12 items-center justify-center gap-2 rounded-lg text-muted-foreground peer-checked:bg-card peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <Icon aria-hidden className="size-4" /><span className="text-left"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs">{value}</span></span>
                </span>
              </label>)}
            </div>
          </fieldset>
          <figure className="mt-4">
            <div className="flex items-center justify-center rounded-xl bg-secondary/75 p-3 sm:p-4">
              <video key={aspectRatio} aria-label={`Cartoon example in ${aspectRatio} format`} controls playsInline preload="none"
                src={`${examplePath}.mp4`} poster={`${examplePath}-poster.jpg`}
                className={`block w-full overflow-hidden rounded-lg bg-black object-contain shadow-sm ${portrait ? "aspect-[9/16] max-w-44 sm:max-w-52" : "aspect-video"}`} />
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex flex-wrap items-center gap-1.5"><Clapperboard aria-hidden className="size-3.5" /> Example animation · <a href="https://pixabay.com/videos/ai-generated-sloth-lazy-funny-cute-230932/" target="_blank" rel="noreferrer" className="underline underline-offset-2">Zeprexa</a></span>
              <span>{aspectRatio} · {resolution} export</span>
            </figcaption>
          </figure>
        </Card>

        <div className="min-w-0 lg:col-start-1">
          {!demo && <label className="mb-4 flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <input type="checkbox" required disabled={pending} checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 accent-primary" />
            I have permission to use this material and agree to send my story and character images to the AI providers.
          </label>}
          {error && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}
          {direct && references.length > 0 && <p className="mb-3 text-sm text-destructive">Remove the character images or select a character-reference model to continue.</p>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium">{direct ? "Storyboard" : "Cast and storyboard"} · {cartoonPlanCredits(quote)} credits</p>
              <p className="mt-1 text-xs text-muted-foreground">Animation after review · {cartoonRenderCredits(quote)} credits</p>
            </div>
            {demo
              ? <Button asChild className="rounded-full px-5"><Link href={portrait ? "/studio/cartoons/demo?format=portrait" : "/studio/cartoons/demo"}>Open sample storyboard <ArrowRight /></Link></Button>
              : <Button type="submit" disabled={pending || !rights || prompt.trim().length < 20 || (direct && references.length > 0)} className="rounded-full px-5">{pending && <LoaderCircle className="animate-spin" />}{phase || "Create project"}<ArrowRight /></Button>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{demo
            ? <>Exploring a sample. <Link href="/login?next=/studio/cartoons" className="font-medium text-primary underline">Sign in to create your cartoon.</Link></>
            : "Creating a project is free. You confirm the credits on the next screen."}</p>
        </div>
      </form>
      {projects.length > 0 && <section className="mt-12">
        <h2 className="text-xl font-semibold">Your recent cartoons</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/studio/cartoons/${project.id}`} className="min-w-0 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary">
          <h3 className="break-words font-medium">{project.title}</h3><p className="mt-2 text-xs capitalize text-muted-foreground">{project.status}</p>
        </Link>)}</div>
      </section>}
    </main>
  );
}
