"use client";

import { useReducer, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, Clapperboard, Copy, Download, Film, Image as ImageIcon, Layers3, LockKeyhole, MapPin, Mic, Plus, ShieldCheck, Sparkles, Trash2, Users, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDuration } from "@/lib/utils";
import { animePreviewExport, animePreviewReducer, animeStyles, createAnimePreview, defaultAnimeBrief, MAX_ANIME_SHOTS, sampleStoryBeats, type AnimeBrief, type AnimeSection, type AnimeShot } from "@/lib/anime/preview";
import { AnimeArt } from "./anime-art";

const sections = [
  { id: "story", label: "Story", icon: BookOpen },
  { id: "characters", label: "Characters", icon: Users },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "storyboard", label: "Storyboard", icon: Layers3 },
  { id: "sound", label: "Sound", icon: Mic },
  { id: "export", label: "Export plan", icon: Download },
] as const;
const cameras = ["Wide shot", "Medium shot", "Close-up", "Slow push in", "Tracking shot"];
const voices = ["Warm / youthful", "Calm / mature", "Bright / energetic", "Soft / reflective"];
const fieldClass = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-xs font-semibold">{label}</label>{children}{hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}</div>;
}

function PanelHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="mb-7"><p className="eyebrow text-primary">{eyebrow}</p><h3 className="editorial mt-2 text-3xl">{title}</h3><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{children}</p></div>;
}

export function AnimeStudio() {
  const [brief, setBrief] = useState<AnimeBrief>({ ...defaultAnimeBrief });
  const [project, dispatch] = useReducer(animePreviewReducer, undefined, () => createAnimePreview());
  const [section, setSection] = useState<AnimeSection>("storyboard");
  const [selectedId, setSelectedId] = useState("shot-1");
  const [message, setMessage] = useState("Sample board loaded. All edits stay in this tab until you download the plan or leave the page.");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const workbench = useRef<HTMLElement>(null);
  const selected = project.shots.find(shot => shot.id === selectedId) ?? project.shots[0];
  const selectedIndex = project.shots.findIndex(shot => shot.id === selected?.id);
  const totalSeconds = project.shots.reduce((sum, shot) => sum + shot.seconds, 0);
  const selectedLocation = project.locations.find(location => location.id === selected?.locationId);
  const selectedCharacter = project.characters.find(character => character.id === selected?.characterId);

  function updateBrief<K extends keyof AnimeBrief>(key: K, value: AnimeBrief[K]) {
    setBrief(current => ({ ...current, [key]: value }));
  }

  function loadSample(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "load", brief: { ...brief, title: brief.title.trim(), prompt: brief.prompt.trim() } });
    setSelectedId("shot-1"); setSection("storyboard"); setReviewed([]);
    setMessage("Sample workflow loaded with your planning settings. The story, cast and illustrations are fixed examples, not generated from your prompt.");
    workbench.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function editShot(changes: Partial<AnimeShot>) {
    if (selected) dispatch({ type: "edit-shot", id: selected.id, changes });
  }

  function downloadPlan() {
    const file = new Blob([JSON.stringify(animePreviewExport(project), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "anime-studio-plan.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Your local project plan was downloaded as JSON. No video was rendered and nothing was uploaded or saved to your account.");
  }

  return <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-10">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-2 rounded-full bg-primary"/>A new space for your stories</div>
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent/60 px-3 py-2 text-xs font-semibold text-primary"><ShieldCheck className="size-3.5" aria-hidden="true"/>Static preview · No credits used</span>
    </div>

    <section className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,.85fr)] xl:gap-12" aria-labelledby="anime-title">
      <div className="min-w-0">
        <p className="eyebrow text-primary">Anime Studio</p>
        <h1 id="anime-title" className="editorial mt-3 max-w-2xl text-[2.7rem] leading-[1.05] tracking-tight sm:text-6xl">A little idea.<br/><span className="italic text-primary">A whole anime world.</span></h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">Shape the story, meet your cast, and give every shot a purpose. Explore your future anime workflow before we connect the engines.</p>
        <div className="mt-7 grid grid-cols-2 gap-3" role="group" aria-label="Creation mode">
          {([{ id: "clip", label: "Quick clip", detail: "One moment, three sample shots", icon: Sparkles }, { id: "episode", label: "Anime episode", detail: "Story, cast & connected shots", icon: Clapperboard }] as const).map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" aria-pressed={brief.mode === id} onClick={() => setBrief(current => ({ ...current, mode: id, targetSeconds: id === "clip" ? 15 : 30 }))} className={cn("flex min-h-20 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:p-4", brief.mode === id ? "border-primary bg-accent/60" : "border-border bg-card hover:border-primary/40")}><Icon className="mt-1 hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true"/><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span></button>)}
        </div>

        <form className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-[0_10px_35px_-30px_#182d4e80] sm:p-6" onSubmit={loadSample} aria-label="Anime project brief">
          <Field id="anime-project-title" label="Project title"><Input id="anime-project-title" value={brief.title} required maxLength={100} className="h-11" onChange={event => updateBrief("title", event.target.value)}/></Field>
          <div className="mt-5"><Field id="anime-prompt" label="What is your story?" hint="Keep one clear goal, a small cast, and a memorable ending."><Textarea id="anime-prompt" value={brief.prompt} required maxLength={4000} className="min-h-28 border-0 bg-transparent p-0 text-sm shadow-none" onChange={event => updateBrief("prompt", event.target.value)}/></Field></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field id="anime-style" label="Visual direction"><select id="anime-style" value={brief.style} onChange={event => updateBrief("style", event.target.value as AnimeBrief["style"])} className={fieldClass}>{animeStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></Field>
            <Field id="anime-format" label="Frame format"><select id="anime-format" value={brief.format} onChange={event => updateBrief("format", event.target.value as AnimeBrief["format"])} className={fieldClass}><option value="16:9">16:9 · Widescreen</option><option value="9:16">9:16 · Vertical</option><option value="1:1">1:1 · Square</option></select></Field>
            <Field id="anime-duration" label="Target length · planning only"><select id="anime-duration" value={brief.targetSeconds} onChange={event => updateBrief("targetSeconds", Number(event.target.value))} className={fieldClass}>{(brief.mode === "clip" ? [5, 10, 15] : [30, 60, 120, 180]).map(seconds => <option key={seconds} value={seconds}>{seconds < 60 ? `${seconds} seconds` : `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`}</option>)}</select></Field>
            <Field id="anime-language" label="Dialogue language · planned"><select id="anime-language" value={brief.language} onChange={event => updateBrief("language", event.target.value)} className={fieldClass}>{["English", "Japanese", "Urdu", "Korean"].map(language => <option key={language}>{language}</option>)}</select></Field>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"><span className="flex items-center gap-2 text-xs text-muted-foreground"><WandSparkles className="size-4" aria-hidden="true"/>AI engines not connected</span><Button type="submit" size="lg" className="rounded-full text-sm">{brief.mode === "clip" ? "Open sample clip" : "Open sample episode"}<ArrowRight aria-hidden="true"/></Button></div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">This opens a fixed example, not an AI result from your prompt. Reopening replaces in-tab edits. No cloud saves, uploads, or generation.</p>
        </form>
      </div>

      <aside className="min-w-0 overflow-hidden rounded-[1.75rem] bg-[#142c57] text-white xl:mt-12" aria-label="Sample anime concept">
        <div className="relative aspect-[5/4] overflow-hidden">
          <AnimeArt scene="city" style={brief.style} className="size-full"/>
          <div className="absolute inset-x-0 top-0 flex justify-between gap-2 p-5"><span className="rounded-full border border-white/30 bg-[#10284b]/75 px-3 py-1.5 text-[10px] uppercase tracking-widest">Concept illustration</span><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#18365d]">Sample story</span></div>
        </div>
        <div className="p-6 sm:p-8"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-blue-200">An ordinary city. An extraordinary delivery.</p><h2 className="editorial mt-3 text-3xl leading-tight text-white sm:text-4xl">The last train home</h2><p className="mt-3 text-sm leading-6 text-blue-100/80">A lost light. A courier. One last chance to bring someone home.</p><div className="mt-6 flex flex-wrap gap-2 text-[10px] text-blue-100">{["2 recurring characters", "3 connected locations", "A hopeful ending"].map(label => <span key={label} className="rounded-full border border-white/20 px-3 py-1.5">{label}</span>)}</div><p className="mt-5 text-[10px] leading-5 text-blue-100/60">Original vector artwork for interface preview. Not generated video.</p></div>
      </aside>
    </section>

    <section ref={workbench} className="mt-12 scroll-mt-5 overflow-hidden rounded-2xl border border-border bg-card" aria-label="Anime project workbench">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7"><div className="min-w-0"><p className="eyebrow text-primary">Your sample workspace</p><h2 className="mt-2 break-words text-xl font-semibold">{project.brief.title}</h2><p className="mt-2 text-xs text-muted-foreground">{project.shots.length} shots · {formatDuration(totalSeconds)} board length · {project.brief.format} · {project.brief.language}</p></div><Button type="button" variant="outline" onClick={downloadPlan} className="min-h-11 rounded-full"><Download aria-hidden="true"/>Download plan</Button></div>
      <nav aria-label="Anime project sections" className="flex gap-1 overflow-x-auto border-y border-border bg-background/50 px-3 sm:px-5">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className={cn("inline-flex min-h-14 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary", section === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4" aria-hidden="true"/>{label}</button>)}</nav>
      <div className="p-5 sm:p-7">
        <p role="status" className="mb-6 rounded-xl border border-primary/15 bg-accent/35 px-4 py-3 text-xs leading-6 text-accent-foreground">{message}</p>

        {section === "story" ? <div>
          <PanelHeading eyebrow="01 / Story room" title="Find the thread worth following.">Start with the premise, then give the beginning, turn and ending a clear job. These are editable planning inputs and a fixed sample outline.</PanelHeading>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"><div className="rounded-xl border border-border bg-background/50 p-5"><h4 className="text-sm font-semibold">Your submitted brief</h4><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{project.brief.prompt}</p><div className="mt-6 rounded-lg bg-accent/50 p-4 text-xs leading-6">Changing the prompt does not generate or rewrite the sample story. AI story planning will be connected in a later phase.</div></div><ol className="space-y-3" aria-label="Sample story beats">{sampleStoryBeats.map((beat, index) => <li key={beat.label} className="rounded-xl border border-border p-5"><span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Beat 0{index + 1} · Sample</span><h4 className="mt-2 font-semibold">{beat.label}</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{beat.text}</p></li>)}</ol></div>
        </div> : null}

        {section === "characters" ? <div>
          <PanelHeading eyebrow="02 / Cast & continuity" title="Characters you can come back to.">Keep a name, defining traits and a voice direction together. The reference lock is a planning marker only; it does not run a consistency model.</PanelHeading>
          <div className="grid gap-5 lg:grid-cols-2">{project.characters.map((character, index) => <article key={character.id} className="overflow-hidden rounded-xl border border-border"><div className="flex items-center justify-between gap-4 bg-accent/35 px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{character.name.slice(0, 1) || "?"}</span><div><h4 className="text-sm font-semibold">Character 0{index + 1}</h4><p className="mt-1 text-xs text-muted-foreground">{character.role}</p></div></div><button type="button" aria-label={`Lock reference for character ${index + 1}`} aria-pressed={character.locked} onClick={() => dispatch({ type: "edit-character", id: character.id, changes: { locked: !character.locked } })} className={cn("flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary", character.locked ? "border-primary/20 bg-card text-primary" : "border-border text-muted-foreground")}><LockKeyhole className="size-3.5" aria-hidden="true"/>{character.locked ? "Reference locked" : "Reference unlocked"}</button></div><div className="space-y-5 p-5"><Field id={`anime-name-${character.id}`} label="Character name"><Input id={`anime-name-${character.id}`} value={character.name} maxLength={60} className="h-11" onChange={event => dispatch({ type: "edit-character", id: character.id, changes: { name: event.target.value } })}/></Field><Field id={`anime-identity-${character.id}`} label="Identity & appearance"><Textarea id={`anime-identity-${character.id}`} value={character.description} maxLength={800} onChange={event => dispatch({ type: "edit-character", id: character.id, changes: { description: event.target.value } })}/></Field><p className="flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon className="size-4 shrink-0" aria-hidden="true"/>Reference image upload will be available after integration.</p></div></article>)}</div>
        </div> : null}

        {section === "locations" ? <div>
          <PanelHeading eyebrow="03 / World building" title="One world, from every angle.">Store the environment separately from the cast so you can reuse a location across shots. Illustrations are static placeholders.</PanelHeading>
          <div className="grid gap-5 lg:grid-cols-3">{project.locations.map(location => <article key={location.id} className="min-w-0 overflow-hidden rounded-xl border border-border"><AnimeArt scene={location.art} style={project.brief.style} className="aspect-video w-full"/><div className="space-y-4 p-5"><Field id={`anime-location-${location.id}`} label="Location name"><Input id={`anime-location-${location.id}`} value={location.name} maxLength={80} className="h-11" onChange={event => dispatch({ type: "edit-location", id: location.id, changes: { name: event.target.value } })}/></Field><Field id={`anime-world-${location.id}`} label="Environment reference"><Textarea id={`anime-world-${location.id}`} value={location.description} maxLength={800} onChange={event => dispatch({ type: "edit-location", id: location.id, changes: { description: event.target.value } })}/></Field></div></article>)}</div>
        </div> : null}

        {section === "storyboard" ? <div>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary">04 / The director’s board</p><h3 className="editorial mt-2 text-3xl">Every moment, in its place.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Select a shot to adjust its framing, dialogue and place in the story.</p></div><Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={project.shots.length >= MAX_ANIME_SHOTS} onClick={() => { setSelectedId(`shot-${project.nextShotId}`); dispatch({ type: "add-shot" }); }}><Plus aria-hidden="true"/>Add shot</Button></div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0"><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Storyboard shots">{project.shots.map((shot, index) => <button key={shot.id} type="button" aria-label={`Select shot ${index + 1}: ${shot.title}`} aria-pressed={selected?.id === shot.id} onClick={() => setSelectedId(shot.id)} className={cn("min-w-0 overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary", selected?.id === shot.id ? "border-primary bg-accent/30 ring-1 ring-primary" : "border-border bg-background/50 hover:border-primary/40")}><div className="relative aspect-video overflow-hidden"><AnimeArt scene={project.locations.find(location => location.id === shot.locationId)?.art} style={project.brief.style} closeUp={shot.camera === "Close-up"} className="size-full"/><span className="absolute top-2 left-2 rounded bg-[#10284b]/80 px-2 py-1 text-[10px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span><span className="absolute right-2 bottom-2 rounded bg-[#10284b]/80 px-2 py-1 text-[10px] text-white">{shot.seconds}s</span></div><span className="block p-4"><span className="block truncate text-sm font-semibold">{shot.title || "Untitled shot"}</span><span className="mt-2 block truncate text-xs text-muted-foreground">{shot.camera} · {project.locations.find(location => location.id === shot.locationId)?.name}</span><span className="mt-3 block text-[9px] font-medium uppercase tracking-widest text-primary">Concept frame · Not rendered</span></span></button>)}</div>
              {project.shots.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center"><Film className="mx-auto size-7 text-primary" aria-hidden="true"/><p className="mt-4 text-sm font-medium">Your storyboard is a blank canvas.</p><p className="mt-2 text-xs text-muted-foreground">Add a shot to start planning again.</p></div> : null}
              <div className="mt-6 rounded-xl border border-border bg-background/50 p-4"><div className="mb-3 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><span>Sequence overview</span><span>{formatDuration(totalSeconds)} planned</span></div><div className="flex min-h-11 gap-1 overflow-hidden rounded-lg" aria-label="Shot duration overview">{project.shots.map((shot, index) => <button key={shot.id} type="button" aria-label={`Jump to shot ${index + 1}`} aria-pressed={selected?.id === shot.id} onClick={() => setSelectedId(shot.id)} className={cn("min-w-5 border border-primary/10 text-[10px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary", selected?.id === shot.id ? "bg-primary text-white" : "bg-accent text-primary")} style={{ flex: shot.seconds }}>{index + 1}</button>)}</div><p className="mt-3 text-[11px] text-muted-foreground">A planning timeline, not video playback. Up to {MAX_ANIME_SHOTS} sample shots.</p></div>
            </div>
            {selected ? <aside className="min-w-0 rounded-xl border border-border bg-background/60 p-5" aria-label="Shot inspector"><div className="mb-5 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">Shot {String(selectedIndex + 1).padStart(2, "0")} / Inspector</h4><span className="text-[10px] font-medium text-primary">Editable sample</span></div><div className="space-y-4"><Field id="anime-shot-title" label="Shot title"><Input id="anime-shot-title" value={selected.title} maxLength={100} className="h-11" onChange={event => editShot({ title: event.target.value })}/></Field><Field id="anime-shot-description" label="Action & composition"><Textarea id="anime-shot-description" value={selected.description} maxLength={1000} className="min-h-28" onChange={event => editShot({ description: event.target.value })}/></Field><div className="grid grid-cols-[1fr_80px] gap-3"><Field id="anime-camera" label="Camera"><select id="anime-camera" className={fieldClass} value={selected.camera} onChange={event => editShot({ camera: event.target.value })}>{cameras.map(camera => <option key={camera}>{camera}</option>)}</select></Field><Field id="anime-shot-duration" label="Seconds"><Input id="anime-shot-duration" type="number" min={1} max={30} value={selected.seconds} className="h-11" onChange={event => editShot({ seconds: Number(event.target.value) })}/></Field></div><Field id="anime-shot-location" label="Linked location"><select id="anime-shot-location" className={fieldClass} value={selected.locationId} onChange={event => editShot({ locationId: event.target.value })}>{project.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field><Field id="anime-shot-character" label="Featured character"><select id="anime-shot-character" className={fieldClass} value={selected.characterId} onChange={event => editShot({ characterId: event.target.value })}>{project.characters.map(character => <option key={character.id} value={character.id}>{character.name || "Unnamed character"}</option>)}</select></Field><Field id="anime-dialogue" label="Dialogue"><Textarea id="anime-dialogue" value={selected.dialogue} maxLength={500} placeholder="A quiet moment, or a line worth saying…" onChange={event => editShot({ dialogue: event.target.value })}/></Field></div><div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4"><Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={selectedIndex === 0} onClick={() => dispatch({ type: "move-shot", id: selected.id, direction: -1 })}><ArrowUp aria-hidden="true"/>Move earlier</Button><Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={selectedIndex === project.shots.length - 1} onClick={() => dispatch({ type: "move-shot", id: selected.id, direction: 1 })}><ArrowDown aria-hidden="true"/>Move later</Button><Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={project.shots.length >= MAX_ANIME_SHOTS} onClick={() => dispatch({ type: "duplicate-shot", id: selected.id })}><Copy aria-hidden="true"/>Duplicate</Button><Button type="button" variant="ghost" className="min-h-11 px-2 text-xs text-destructive" onClick={() => dispatch({ type: "remove-shot", id: selected.id })}><Trash2 aria-hidden="true"/>Remove shot</Button></div><p className="mt-4 text-[11px] leading-5 text-muted-foreground">Reference: {selectedCharacter?.name || "Unnamed character"} at {selectedLocation?.name}. Editing text does not regenerate the illustration.</p></aside> : null}
          </div>
        </div> : null}

        {section === "sound" ? <div>
          <PanelHeading eyebrow="05 / Voice & atmosphere" title="Leave room for the sound of it.">Map voices to your cast and choose an atmosphere. These are saved planning preferences only—there is no synthesized audio or lip sync in this prototype.</PanelHeading>
          <div className="grid gap-6 lg:grid-cols-2"><div className="space-y-4 rounded-xl border border-border p-5"><h4 className="mb-5 text-sm font-semibold">Character voice directions</h4>{project.characters.map(character => <Field key={character.id} id={`anime-voice-${character.id}`} label={character.name || "Unnamed character"}><select id={`anime-voice-${character.id}`} className={fieldClass} value={character.voice} onChange={event => dispatch({ type: "edit-character", id: character.id, changes: { voice: event.target.value } })}>{voices.map(voice => <option key={voice}>{voice}</option>)}</select></Field>)}</div><div className="space-y-6 rounded-xl border border-border p-5"><Field id="anime-music" label="Background music direction"><select id="anime-music" className={fieldClass} value={project.music} onChange={event => dispatch({ type: "sound", music: event.target.value })}>{["Soft cinematic", "Ambient city", "Bright adventure", "No music"].map(music => <option key={music}>{music}</option>)}</select></Field><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={project.narration} onChange={event => dispatch({ type: "sound", narration: event.target.checked })} className="mt-1 size-4 accent-primary"/><span>Include a narrator in the plan<span className="mt-1 block text-xs leading-6 text-muted-foreground">Narration synthesis and timing will be connected later.</span></span></label><div className="flex h-20 items-center justify-center gap-1 rounded-xl bg-accent/45" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <span key={index} className="w-1.5 rounded-full bg-primary/30" style={{ height: 10 + (index * 13) % 37 }}/>)}</div><p className="text-xs text-muted-foreground">Decorative waveform only. No audio is playing.</p></div></div>
        </div> : null}

        {section === "export" ? <div>
          <PanelHeading eyebrow="06 / Before the final cut" title="A plan you can take with you.">Download this browser-local project as JSON. Video generation, media exports, cloud projects and model pricing are intentionally not connected yet.</PanelHeading>
          <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-xl border border-border p-5"><h4 className="text-sm font-semibold">Creative review checklist</h4><div className="mt-4 space-y-3">{["The story has a clear beginning and ending", "Character traits are consistent across shots", "Locations and camera directions connect", "Dialogue fits the planned shot lengths", "All source material will be rights-cleared"].map(item => <label key={item} className="flex min-h-11 items-center gap-3 text-sm leading-6"><input type="checkbox" className="size-4 shrink-0 accent-primary" checked={reviewed.includes(item)} onChange={event => setReviewed(current => event.target.checked ? [...current, item] : current.filter(value => value !== item))}/>{item}</label>)}</div><p className="mt-4 text-xs text-muted-foreground">{reviewed.length} of 5 review notes checked · Not a generation requirement</p></div><div className="rounded-xl border border-primary/20 bg-accent/35 p-6"><Download className="size-6 text-primary" aria-hidden="true"/><h4 className="mt-4 text-lg font-semibold">Your blueprint, not a rendered video.</h4><p className="mt-3 text-sm leading-7 text-muted-foreground">Includes your brief, format, cast, reference notes, shot sequence, timings, dialogue and sound directions. Everything is labelled as a static sample plan.</p><Button type="button" onClick={downloadPlan} className="mt-6 min-h-11 rounded-full"><Download aria-hidden="true"/>Download project plan (JSON)</Button><Button type="button" variant="outline" disabled className="mt-3 min-h-11 w-full justify-center" title="Video rendering is not connected"><Film aria-hidden="true"/>Render video · Coming later</Button></div></div>
        </div> : null}
      </div>
    </section>

    <section className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8" aria-labelledby="anime-later"><div className="flex items-center gap-2 text-primary"><Check className="size-4" aria-hidden="true"/><p className="eyebrow">Built to grow, one layer at a time</p></div><h2 id="anime-later" className="editorial mt-3 text-2xl">The creative workflow is here. The engines come next.</h2><div className="mt-6 grid gap-5 sm:grid-cols-3">{[{ title: "01 / Plan & approve", text: "Try briefs, reusable cast notes, locations and an editable shot board in this prototype." }, { title: "02 / Connect generation", text: "Later: story planning, character references, keyframes, video models and per-shot retries." }, { title: "03 / Finish & deliver", text: "Later: narration, licensed audio, final assembly, cloud saving and reviewed exports." }].map(item => <div key={item.title}><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{item.text}</p></div>)}</div></section>
  </main>;
}
