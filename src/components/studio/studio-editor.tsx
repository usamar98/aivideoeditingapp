"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Captions,
  Check,
  CircleDollarSign,
  Clock3,
  Download,
  Expand,
  Film,
  ListChecks,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { demoCharacters, demoSeriesGuide } from "@/lib/editor/demo";
import { aspectRatioSchema, characterSchema, episodeSchema, type Character, type Episode, type Scene } from "@/lib/editor/schemas";
import { formatCredits, formatDuration } from "@/lib/utils";

type SaveState = "saved" | "saving" | "restored";

function sceneBadge(scene: Scene) {
  if (scene.approved) return { label: "Approved", variant: "success" as const };
  if (scene.status === "animating" || scene.status === "queued") return { label: "Generating", variant: "warning" as const };
  if (scene.status === "failed") return { label: "Needs attention", variant: "destructive" as const };
  if (scene.status === "frame_ready") return { label: "Review frame", variant: "default" as const };
  return { label: "Draft", variant: "outline" as const };
}

function downloadSubtitles(episode: Episode) {
  let cursor = 0;
  const cues = episode.scenes.map((scene, index) => {
    const start = cursor;
    const end = cursor + scene.audioDurationSeconds;
    cursor = end;
    const timestamp = (seconds: number) => {
      const date = new Date(seconds * 1000).toISOString().slice(11, 23).replace(".", ",");
      return date;
    };
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${scene.dialogue.replaceAll(/^[^:]+:\s*/gm, "")}\n`;
  });
  const url = URL.createObjectURL(new Blob([cues.join("\n")], { type: "application/x-subrip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${episode.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.srt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function StudioEditor({ initialEpisode, viewerEmail }: { initialEpisode: Episode; viewerEmail: string }) {
  const storageKey = `framefoundry:episode:${initialEpisode.id}`;
  const characterStorageKey = `framefoundry:characters:${initialEpisode.seriesId}`;
  const [episode, setEpisode] = useState(initialEpisode);
  const [characters, setCharacters] = useState(demoCharacters);
  const [selectedSceneId, setSelectedSceneId] = useState(initialEpisode.scenes[0].id);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [playing, setPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [nextEpisodeOpen, setNextEpisodeOpen] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          setEpisode(episodeSchema.parse(JSON.parse(saved)));
          setSaveState("restored");
        }
        const savedCharacters = window.localStorage.getItem(characterStorageKey);
        if (savedCharacters) setCharacters(characterSchema.array().parse(JSON.parse(savedCharacters)));
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        restored.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [characterStorageKey, storageKey]);

  useEffect(() => {
    if (!restored.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(episode));
      window.localStorage.setItem(characterStorageKey, JSON.stringify(characters));
      setSaveState("saved");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [characterStorageKey, characters, episode, storageKey]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayProgress((current) => {
        if (current >= 100) {
          setPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [playing]);

  const selectedScene = episode.scenes.find((scene) => scene.id === selectedSceneId) || episode.scenes[0];
  const totalDuration = useMemo(
    () => episode.scenes.reduce((total, scene) => total + scene.audioDurationSeconds, 0),
    [episode.scenes],
  );
  const estimate = useMemo(
    () => episode.scenes.filter((scene) => !scene.approved).reduce((total, scene) => total + scene.creditEstimate, 0),
    [episode.scenes],
  );
  const approvedCount = episode.scenes.filter((scene) => scene.approved).length;
  const editingCharacter = characters.find((character) => character.id === editingCharacterId);

  const updateScene = (patch: Partial<Scene>) => {
    setEpisode((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === selectedScene.id ? { ...scene, ...patch } : scene)),
    }));
  };

  const moveScene = (direction: -1 | 1) => {
    setEpisode((current) => {
      const index = current.scenes.findIndex((scene) => scene.id === selectedScene.id);
      const next = index + direction;
      if (next < 0 || next >= current.scenes.length) return current;
      const scenes = [...current.scenes];
      [scenes[index], scenes[next]] = [scenes[next], scenes[index]];
      return { ...current, scenes: scenes.map((scene, position) => ({ ...scene, position })) };
    });
  };

  const updateCharacter = (patch: Partial<Character>) => {
    if (!editingCharacterId) return;
    setCharacters((current) => current.map((character) => character.id === editingCharacterId ? { ...character, ...patch } : character));
  };

  const addCharacter = () => {
    const character: Character = {
      id: crypto.randomUUID(),
      name: "New character",
      role: "Supporting character",
      personality: "Describe how this character behaves and reacts.",
      appearance: "Describe face, hair, colors, and defining features.",
      wardrobe: "Describe the approved outfit and accessories.",
      proportions: "Stylized 3D cartoon proportions.",
      voiceName: "Ellis — calm narrator",
      voiceId: "preset_ellis",
      referenceUrl: "/demo/pip-moss-reference.png",
      approved: false,
    };
    setCharacters((current) => [...current, character]);
    setEditingCharacterId(character.id);
  };

  const simulateRegeneration = () => {
    setRegenerateOpen(false);
    updateScene({ status: "queued", approved: false });
    toast.message("Demo request queued", { description: "No provider call or credit deduction was made." });
    window.setTimeout(() => updateScene({ status: "animating" }), 700);
    window.setTimeout(() => {
      updateScene({ status: "frame_ready" });
      toast.success("Demo frame ready for review", { description: "This is a labelled development fixture, not a real generation." });
    }, 2200);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[4.5rem] shrink-0 flex-col items-center border-r border-border bg-card/70 py-4 backdrop-blur-xl md:flex">
        <Link href="/" className="grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-primary" aria-label="Home"><Sparkles className="size-4" /></Link>
        <nav className="mt-10 flex flex-1 flex-col gap-2" aria-label="Editor sections">
          {[Film, ListChecks].map((Icon, index) => (
            <Link key={index} href={index ? "/studio/jobs" : "/studio"} aria-label={index ? "Jobs" : "Projects"} title={index ? "Jobs" : "Projects"} className={`grid size-10 place-items-center rounded-lg ${index === 0 ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}><Icon className="size-[1.125rem]" /></Link>
          ))}
        </nav>
        <span title={viewerEmail} className="grid size-9 place-items-center rounded-full border border-border bg-secondary text-xs font-bold">UC</span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/85 px-3 backdrop-blur-xl sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Button asChild size="icon" variant="ghost" className="hidden sm:inline-flex"><Link href="/studio" aria-label="Back to projects"><ArrowLeft /></Link></Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold sm:text-base">{episode.title}</h1>
                <Badge variant="outline" className="hidden uppercase tracking-wide lg:inline-flex">Episode {episode.number}</Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Pip & Moss</span>
                <span className="hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1">
                  {saveState === "saving" ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3 text-primary" />}
                  {saveState === "saving" ? "Saving…" : saveState === "restored" ? "Draft restored" : "Autosaved"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="hidden xl:inline-flex">Fixture mode · no provider calls</Badge>
            <Button asChild variant="ghost" size="icon"><Link href="/studio/jobs" aria-label="Jobs" title="Jobs"><ListChecks /></Link></Button>
            <Button variant="ghost" size="icon" aria-label="Undo"><Undo2 /></Button>
            <Button variant="ghost" size="icon" aria-label="Redo"><Redo2 /></Button>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => downloadSubtitles(episode)}><Download /> Subtitles</Button>
            <Button size="sm" onClick={() => toast.error("Export needs provider credentials", { description: "Connect Supabase, Trigger.dev, fal.ai, and ElevenLabs to render a real MP4." })}><Film /> Export</Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
          <section className="order-2 border-t border-border bg-card/35 xl:order-1 xl:border-r xl:border-t-0" aria-label="Storyboard scenes">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Storyboard</h2>
                <p className="text-xs text-muted-foreground">{approvedCount}/{episode.scenes.length} approved</p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Add scene" onClick={() => toast.message("Add scene", { description: "New scenes are created from the episode script in a connected workspace." })}><Plus /></Button>
            </div>
            <div className="flex gap-3 overflow-x-auto px-3 pb-4 xl:block xl:max-h-[calc(100vh-8rem)] xl:space-y-2 xl:overflow-y-auto xl:overflow-x-visible">
              {episode.scenes.map((scene, index) => {
                const badge = sceneBadge(scene);
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`w-52 shrink-0 rounded-xl border p-2 text-left transition-colors xl:w-full ${scene.id === selectedScene.id ? "border-primary/50 bg-primary/8" : "border-transparent hover:border-border hover:bg-accent/50"}`}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-secondary">
                      <Image src={scene.frameUrl} alt={`Storyboard frame for ${scene.title}`} fill sizes="(max-width: 1280px) 208px, 208px" className="object-cover" />
                      <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-black/65 font-mono text-[0.6875rem] text-white">{String(index + 1).padStart(2, "0")}</span>
                      {(scene.status === "queued" || scene.status === "animating") && <span className="absolute inset-0 grid place-items-center bg-black/55"><LoaderCircle className="size-6 animate-spin text-primary" /></span>}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{scene.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{scene.audioDurationSeconds.toFixed(1)}s · {scene.characters.join(", ")}</p>
                      </div>
                      <Badge variant={badge.variant} className="px-1.5 py-0.5 text-[0.625rem]">{badge.label}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <main className="studio-grid order-1 flex min-w-0 flex-col xl:order-2">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Select value={episode.aspectRatio} onValueChange={(value) => setEpisode((current) => ({ ...current, aspectRatio: aspectRatioSchema.parse(value) }))}>
                  <SelectTrigger className="h-9 w-28 bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="16:9">Landscape</SelectItem><SelectItem value="9:16">Vertical</SelectItem></SelectContent>
                </Select>
                <Badge variant="outline">{episode.aspectRatio}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Restart preview" onClick={() => setPlayProgress(0)}><RotateCcw /></Button>
                <Button variant="ghost" size="icon" aria-label="Fullscreen preview"><Expand /></Button>
                <Button variant="ghost" size="icon" aria-label="More preview options"><MoreHorizontal /></Button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center px-3 pb-3 sm:px-8 sm:pb-6">
              <div className={`relative w-full overflow-hidden rounded-xl border border-border bg-black shadow-2xl ${episode.aspectRatio === "16:9" ? "max-w-5xl aspect-video" : "max-h-[65vh] max-w-sm aspect-[9/16]"}`}>
                <Image
                  src={selectedScene.frameUrl}
                  alt={`Preview frame: ${selectedScene.title}`}
                  fill
                  loading="eager"
                  fetchPriority="high"
                  sizes={episode.aspectRatio === "16:9" ? "(max-width: 1280px) 100vw, 900px" : "400px"}
                  className="object-cover"
                />
                {playing && <div className="media-shine absolute inset-0" />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-4 pb-4 pt-16 sm:px-6">
                  {selectedScene.captionsEnabled && (
                    <p className="mx-auto mb-4 w-fit max-w-[90%] rounded-md bg-black/72 px-3 py-1.5 text-center text-sm font-medium text-white shadow-lg sm:text-base">
                      {selectedScene.dialogue.split(". ")[0]}.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <Button size="icon" className="rounded-full" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => setPlaying((value) => !value)}>
                      {playing ? <Pause /> : <Play className="translate-x-px" />}
                    </Button>
                    <div className="flex-1"><Progress value={playProgress} /></div>
                    <span className="font-mono text-xs text-white/80">{formatDuration(selectedScene.audioDurationSeconds)}</span>
                  </div>
                </div>
                <div className="absolute left-3 top-3 flex gap-2">
                  <Badge variant="secondary" className="border-black/20 bg-black/65 text-white">Scene {selectedScene.position + 1}</Badge>
                  <Badge variant="warning">Preview</Badge>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-card/45 px-4 py-3 backdrop-blur sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">00:00</span>
                  <div className="hidden items-center gap-1 sm:flex">
                    {episode.scenes.map((scene) => (
                      <button key={scene.id} onClick={() => setSelectedSceneId(scene.id)} className={`h-8 rounded-md border px-3 text-xs ${scene.id === selectedScene.id ? "border-primary/50 bg-primary/12 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>{scene.position + 1}</button>
                    ))}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatDuration(totalDuration)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {totalDuration.toFixed(1)} / {episode.targetDurationSeconds}s</span>
                  <span className="inline-flex items-center gap-1"><CircleDollarSign className="size-3.5" /> {formatCredits(estimate)} credits left</span>
                </div>
              </div>
            </div>
          </main>

          <aside className="order-3 border-t border-border bg-card/60 xl:border-l xl:border-t-0">
            <Tabs defaultValue="scene" className="h-full">
              <div className="border-b border-border px-4 pt-3">
                <TabsList className="w-full bg-transparent p-0">
                  <TabsTrigger value="scene" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Scene</TabsTrigger>
                  <TabsTrigger value="cast" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Cast</TabsTrigger>
                  <TabsTrigger value="guide" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Guide</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="scene" className="m-0 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scene {selectedScene.position + 1}</p>
                    <h2 className="mt-1 font-semibold">{selectedScene.title}</h2>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => moveScene(-1)} aria-label="Move scene earlier"><ArrowUp /></Button>
                    <Button variant="ghost" size="icon" onClick={() => moveScene(1)} aria-label="Move scene later"><ArrowDown /></Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dialogue">Dialogue</Label>
                  <Textarea id="dialogue" value={selectedScene.dialogue} onChange={(event) => updateScene({ dialogue: event.target.value, approved: false })} />
                  <p className="text-xs text-muted-foreground">Audio timing: {selectedScene.audioDurationSeconds.toFixed(1)}s</p>
                </div>

                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select value={selectedScene.voiceId} onValueChange={(voiceId) => updateScene({ voiceId, approved: false })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preset_maya">Maya — bright, warm</SelectItem>
                      <SelectItem value="preset_quinn">Quinn — gentle, precise</SelectItem>
                      <SelectItem value="preset_ellis">Ellis — calm narrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action">Action</Label>
                  <Textarea id="action" value={selectedScene.action} onChange={(event) => updateScene({ action: event.target.value, approved: false })} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="camera">Camera direction</Label>
                  <Textarea id="camera" value={selectedScene.camera} onChange={(event) => updateScene({ camera: event.target.value, approved: false })} />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2"><Captions className="size-4 text-primary" /><div><p className="text-sm font-medium">Captions</p><p className="text-xs text-muted-foreground">Use speech timing</p></div></div>
                  <Switch checked={selectedScene.captionsEnabled} onCheckedChange={(captionsEnabled) => updateScene({ captionsEnabled })} aria-label="Toggle captions" />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Regenerate scene</span><span className="font-mono">{selectedScene.creditEstimate} credits</span></div>
                  <Button variant="outline" className="w-full" onClick={() => setRegenerateOpen(true)}><WandSparkles /> Regenerate only this scene</Button>
                  <Button
                    className="w-full"
                    variant={selectedScene.approved ? "secondary" : "default"}
                    onClick={() => updateScene({ approved: !selectedScene.approved, status: !selectedScene.approved ? "approved" : "frame_ready" })}
                  >
                    <Check /> {selectedScene.approved ? "Frame approved" : "Approve frame"}
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">Approved scenes stay unchanged when another scene is regenerated.</p>
                </div>
              </TabsContent>

              <TabsContent value="cast" className="m-0 space-y-3 p-5" id="characters">
                <Button variant="outline" className="w-full" onClick={addCharacter}><Plus /> Add character</Button>
                {characters.map((character) => (
                  <div key={character.id} className="rounded-xl border border-border bg-background/45 p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative size-14 overflow-hidden rounded-lg bg-secondary"><Image src={character.referenceUrl} alt={`${character.name} approved reference`} fill sizes="56px" className="object-cover" /></div>
                      <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-semibold">{character.name}</p><Badge variant={character.approved ? "success" : "outline"}>{character.approved ? "Approved" : "Draft"}</Badge></div><p className="truncate text-xs text-muted-foreground">{character.voiceName}</p></div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{character.personality}</p>
                    <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setEditingCharacterId(character.id)}><Pencil /> Edit profile</Button>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted-foreground">References guide consistency across episodes; identity preservation can still vary and should be reviewed.</p>
              </TabsContent>

              <TabsContent value="guide" className="m-0 space-y-5 p-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Visual style</p><p className="mt-2 text-sm leading-relaxed">{demoSeriesGuide.visualStyle}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Palette</p><div className="mt-2 flex gap-2">{demoSeriesGuide.palette.map((color) => <span key={color} className="size-8 rounded-full border border-white/10" style={{ backgroundColor: color }} title={color} />)}</div></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Continuity rules</p><ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{demoSeriesGuide.continuity.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul></div>
                <Button variant="outline" className="w-full" onClick={() => setNextEpisodeOpen(true)}><Plus /> Create next episode</Button>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>

      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regenerate scene {selectedScene.position + 1}?</DialogTitle><DialogDescription>Only “{selectedScene.title}” will be replaced. The other {episode.scenes.length - 1} scenes stay unchanged. Estimated charge: {selectedScene.creditEstimate} credits.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-amber/25 bg-amber/8 p-3 text-sm text-amber-200">Fixture mode simulates the queue without contacting fal.ai or deducting credits.</div>
          <DialogFooter><Button variant="ghost" onClick={() => setRegenerateOpen(false)}>Cancel</Button><Button onClick={simulateRegeneration}><WandSparkles /> Queue demo regeneration</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nextEpisodeOpen} onOpenChange={setNextEpisodeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start episode {episode.number + 1}</DialogTitle><DialogDescription>The series guide and approved cast will carry forward. Review the recap before generating a new script.</DialogDescription></DialogHeader>
          <div><Label htmlFor="recap">Editable recap</Label><Textarea id="recap" className="mt-2 min-h-32" value={episode.recap} onChange={(event) => setEpisode((current) => ({ ...current, recap: event.target.value }))} /></div>
          <DialogFooter><Button variant="ghost" onClick={() => setNextEpisodeOpen(false)}>Not yet</Button><Button onClick={() => { setNextEpisodeOpen(false); toast.message("Episode idea ready", { description: "Connect Gemini to generate the structured script and storyboard." }); }}><Sparkles /> Continue with this world</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCharacter)} onOpenChange={(open) => !open && setEditingCharacterId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit character profile</DialogTitle><DialogDescription>Keep approved visual and voice details reusable across every episode.</DialogDescription></DialogHeader>
          {editingCharacter && <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="character-name">Name</Label><Input id="character-name" value={editingCharacter.name} onChange={(event) => updateCharacter({ name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="character-role">Role</Label><Input id="character-role" value={editingCharacter.role} onChange={(event) => updateCharacter({ role: event.target.value })} /></div></div>
            <div className="space-y-2"><Label htmlFor="character-appearance">Appearance</Label><Textarea id="character-appearance" value={editingCharacter.appearance} onChange={(event) => updateCharacter({ appearance: event.target.value, approved: false })} /></div>
            <div className="space-y-2"><Label htmlFor="character-wardrobe">Wardrobe</Label><Textarea id="character-wardrobe" value={editingCharacter.wardrobe} onChange={(event) => updateCharacter({ wardrobe: event.target.value, approved: false })} /></div>
            <div className="space-y-2"><Label htmlFor="character-proportions">Proportions</Label><Textarea id="character-proportions" value={editingCharacter.proportions} onChange={(event) => updateCharacter({ proportions: event.target.value, approved: false })} /></div>
            <div className="space-y-2"><Label htmlFor="character-personality">Personality</Label><Textarea id="character-personality" value={editingCharacter.personality} onChange={(event) => updateCharacter({ personality: event.target.value })} /></div>
            <div className="space-y-2"><Label>Licensed preset voice</Label><Select value={editingCharacter.voiceId} onValueChange={(voiceId) => { const voiceName = voiceId === "preset_maya" ? "Maya — bright, warm" : voiceId === "preset_quinn" ? "Quinn — gentle, precise" : "Ellis — calm narrator"; updateCharacter({ voiceId, voiceName }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="preset_maya">Maya — bright, warm</SelectItem><SelectItem value="preset_quinn">Quinn — gentle, precise</SelectItem><SelectItem value="preset_ellis">Ellis — calm narrator</SelectItem></SelectContent></Select></div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3"><div><p className="text-sm font-medium">Approved reference profile</p><p className="text-xs text-muted-foreground">Edits to visual traits require another review.</p></div><Switch checked={editingCharacter.approved} onCheckedChange={(approved) => updateCharacter({ approved })} aria-label="Approve character profile" /></div>
            <p className="text-xs leading-relaxed text-muted-foreground">This fixture reuses the sample reference sheet. Connected workspaces upload private reference images to versioned character assets.</p>
          </div>}
          <DialogFooter><Button onClick={() => setEditingCharacterId(null)}><Save /> Save profile</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
