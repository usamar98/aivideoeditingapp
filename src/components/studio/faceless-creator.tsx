"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Film, LoaderCircle, Monitor, SlidersHorizontal, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createFacelessProject } from "@/app/studio/faceless/actions";
import { DEFAULT_FACELESS_IMAGE_MODEL, FACELESS_IMAGE_OPTIONS } from "@/lib/faceless/models";
import { briefSchema, defaultBrief, type FacelessBrief } from "@/lib/faceless/schema";

const formats = [
  { value: "9:16", label: "Portrait", icon: Smartphone },
  { value: "16:9", label: "Landscape", icon: Monitor },
] as const;

const durations = [{ value: "30", label: "30 seconds" }, { value: "60", label: "60 seconds" }] as const;
const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
] as const;

function OptionField<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block min-w-0 space-y-2 text-sm font-medium">
      <span>{label}</span>
      <span className="relative block">
        <select
          className="h-11 w-full appearance-none rounded-xl border border-input bg-background/60 pl-3 pr-8 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" />
      </span>
    </label>
  );
}

export function FacelessCreator({ demo, projects }: {
  demo: boolean;
  projects: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState<FacelessBrief>(defaultBrief);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const keepScript = brief.mode === "script";
  const wordCount = brief.topic.trim() ? brief.topic.trim().split(/\s+/).length : 0;
  const wordLimit = brief.duration === 30 ? 80 : 155;
  const portrait = brief.aspectRatio === "9:16";

  function update<K extends keyof FacelessBrief>(key: K, value: FacelessBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || pending) return;
    const parsed = briefSchema.safeParse(brief);
    if (!parsed.success) {
      setError("Enter an idea or script between 12 and 1,800 characters.");
      return;
    }
    if (keepScript && (wordCount < 12 || wordCount > wordLimit)) {
      setError("For this length, use 12 to " + wordLimit + " words in your narration.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const result = await createFacelessProject(parsed.data);
        if (result.error) setError(result.error);
        else if (result.id) router.push("/studio/faceless/" + result.id);
      } catch {
        setError("Couldn’t save your project. Check your connection and try again.");
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-11">
      <header className="mb-7 max-w-2xl">
        <h1 className="editorial text-[clamp(2.4rem,5vw,4rem)] leading-[1.04] tracking-[-.045em]">Faceless video studio</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Turn an idea or script into a narrated video. Review each scene before you render.
        </p>
      </header>

      <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(290px,1fr)]">
        <Card className="min-w-0 rounded-2xl p-5 sm:p-7">
          <Label htmlFor="video-topic" className="text-lg font-semibold tracking-tight">Your idea or script</Label>
          <Textarea
            id="video-topic"
            required minLength={12} maxLength={1800}
            aria-describedby="faceless-writing-hint"
            className="mt-3 min-h-36 resize-y rounded-xl bg-background/60 p-4 text-base leading-6"
            value={brief.topic}
            onChange={(event) => update("topic", event.target.value)}
            placeholder={keepScript ? "Paste the words you want the narrator to say…" : "Why does looking at the night sky mean looking into the past?"}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Switch id="keep-script" checked={keepScript} onCheckedChange={(checked) => update("mode", checked ? "script" : "idea")} />
              <Label htmlFor="keep-script" className="cursor-pointer">Use my exact script</Label>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {keepScript ? wordCount + " / " + wordLimit + " words" : brief.topic.length + " / 1,800"}
            </span>
          </div>
          <p id="faceless-writing-hint" className="mt-2 text-xs leading-5 text-muted-foreground">
            {keepScript ? "Use 12 to " + wordLimit + " words. Your wording stays intact as it’s split into scenes." : "AI drafts an editable script from your idea. Turn on exact script to keep your own narration."}
          </p>

          <div className="mt-6 grid gap-4 border-t border-border pt-5 min-[380px]:grid-cols-2">
            <OptionField label="Target length" value={String(brief.duration)} options={durations} onChange={(value) => update("duration", value === "60" ? 60 : 30)} />
            <OptionField label="Visual style" value={brief.style} options={briefSchema.shape.style.options.map((value) => ({ value, label: value }))} onChange={(value) => update("style", value)} />
          </div>
          <details className="group mt-5 border-t border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-4 text-sm font-medium focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
              Generation settings
              <ChevronDown aria-hidden="true" className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid items-end gap-4 pt-1 min-[380px]:grid-cols-2">
              <OptionField label="Image model" value={brief.imageModel ?? DEFAULT_FACELESS_IMAGE_MODEL} options={FACELESS_IMAGE_OPTIONS} onChange={(value) => update("imageModel", value)} />
              <OptionField label="Narration language" value={brief.language} options={languages} onChange={(value) => update("language", value)} />
              {!keepScript && <OptionField label="Story tone" value={brief.tone} options={briefSchema.shape.tone.options.map((value) => ({ value, label: value }))} onChange={(value) => update("tone", value)} />}
              <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-border px-3">
                <Label htmlFor="captions">Timed captions</Label>
                <Switch id="captions" checked={brief.captions} onCheckedChange={(checked) => update("captions", checked)} />
              </div>
            </div>
          </details>
        </Card>

        <Card className="min-w-0 overflow-hidden rounded-2xl p-5 sm:p-6 lg:row-span-2">
          <fieldset>
            <legend className="text-lg font-semibold tracking-tight">Video format</legend>
            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1">
              {formats.map(({ value, label, icon: Icon }) => (
                <label key={value} className="relative min-w-0 cursor-pointer">
                  <input type="radio" name="video-format" className="peer sr-only" value={value} checked={brief.aspectRatio === value} onChange={() => update("aspectRatio", value)} />
                  <span className="flex min-h-12 items-center justify-center gap-2 rounded-lg text-muted-foreground transition-colors peer-checked:bg-card peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="text-left leading-tight">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="text-[11px]">{value}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <figure className="mt-4">
            <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[#e8edf4] via-[#dfe5ed] to-[#d2dce7] p-3 sm:p-5">
              <video
                aria-label={"Sample faceless video in " + brief.aspectRatio + " format"}
                controls playsInline preload="none"
                poster="/examples/faceless-story-poster.jpg" src="/examples/faceless-story.mp4"
                className={"block overflow-hidden rounded-lg bg-black object-cover shadow-lg " + (portrait ? "aspect-[9/16] w-full max-w-40 sm:max-w-[192px]" : "aspect-video w-full")}
              />
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Film aria-hidden="true" className="size-3.5" /> Sample video</span>
              <span>Export {portrait ? "720 × 1280" : "1280 × 720"} px</span>
            </figcaption>
          </figure>
        </Card>

        <div className="min-w-0 lg:col-start-1">
          {error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium">{keepScript ? "Script preparation is free" : "AI script · 2 credits"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Video render · 20 credits after review</p>
            </div>
            {demo ? (
              <Button asChild className="rounded-full px-5"><Link href={portrait ? "/studio/faceless/demo" : "/studio/faceless/demo?format=landscape"}>Open sample storyboard <ArrowRight /></Link></Button>
            ) : (
              <Button type="submit" disabled={pending} className="rounded-full px-5">
                {pending ? <><LoaderCircle className="animate-spin" /> Saving project…</> : <>Create project <ArrowRight /></>}
              </Button>
            )}
          </div>
          {demo && <p className="mt-3 text-xs text-muted-foreground">Exploring a sample. <Link href="/login?next=/studio/faceless" className="font-medium text-primary underline underline-offset-2">Sign in to create your own video.</Link></p>}
        </div>
      </form>

      {projects.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Your recent faceless videos</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={"/studio/faceless/" + project.id} className="min-w-0 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary">
                <p className="break-words font-medium">{project.title}</p>
                <p className="mt-2 text-xs capitalize text-muted-foreground">{project.status}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
