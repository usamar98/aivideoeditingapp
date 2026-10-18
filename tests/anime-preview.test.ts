import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { AnimeStudio } from "@/components/studio/anime-studio";
import { AnimePreviewCard } from "@/components/studio/anime-preview-card";
import { AnimeArt } from "@/components/studio/anime-art";
import { animePreviewExport, animePreviewReducer, createAnimePreview, defaultAnimeBrief, MAX_ANIME_SHOTS } from "@/lib/anime/preview";

describe("static Anime Studio planning data", () => {
  it.each([30, 60, 120, 180])("distributes a %s-second episode across six sample shots", targetSeconds => {
    const project = createAnimePreview({ ...defaultAnimeBrief, targetSeconds });
    expect(project.source).toBe("static-sample");
    expect(project.shots).toHaveLength(6);
    expect(project.shots.reduce((total, shot) => total + shot.seconds, 0)).toBe(targetSeconds);
    expect(project.shots.every(shot => shot.seconds >= 1 && shot.seconds <= 30)).toBe(true);
    expect(project.shots.every(shot => project.locations.some(location => location.id === shot.locationId))).toBe(true);
    expect(project.shots.every(shot => project.characters.some(character => character.id === shot.characterId))).toBe(true);
  });

  it.each([5, 10, 15])("plans a %s-second quick clip without claiming generation", targetSeconds => {
    const project = createAnimePreview({ ...defaultAnimeBrief, mode: "clip", targetSeconds });
    expect(project.shots).toHaveLength(3);
    expect(project.shots.reduce((total, shot) => total + shot.seconds, 0)).toBe(targetSeconds);
    expect(animePreviewExport(project).generatedMedia).toBe(false);
  });

  it("retains a custom brief but labels the fixed example instead of faking prompt-to-story generation", () => {
    const project = createAnimePreview({ ...defaultAnimeBrief, title: "My project", prompt: "A completely different story" });
    expect(project.brief.prompt).toBe("A completely different story");
    expect(project.brief.title).toBe("My project");
    expect(project.shots[0].title).toBe("A city after the rain");
    expect(animePreviewExport(project).notice).toContain("No AI generation");
  });

  it("edits fields and clamps shot timing without mutating the old board", () => {
    const original = createAnimePreview();
    const changed = animePreviewReducer(original, { type: "edit-shot", id: "shot-1", changes: { title: "New opening", seconds: 200, dialogue: "Hello" } });
    expect(changed.shots[0]).toMatchObject({ title: "New opening", seconds: 30, dialogue: "Hello" });
    expect(original.shots[0]).toMatchObject({ title: "A city after the rain", seconds: 5 });
    const clamped = animePreviewReducer(changed, { type: "edit-shot", id: "shot-1", changes: { seconds: Number.NaN } });
    expect(clamped.shots[0].seconds).toBe(1);
  });

  it("reorders, duplicates, and removes shots with stable unique IDs", () => {
    const initial = createAnimePreview();
    const moved = animePreviewReducer(initial, { type: "move-shot", id: "shot-2", direction: -1 });
    expect(moved.shots[0].id).toBe("shot-2");
    expect(initial.shots[0].id).toBe("shot-1");
    expect(animePreviewReducer(moved, { type: "move-shot", id: "shot-2", direction: -1 })).toBe(moved);
    const copied = animePreviewReducer(moved, { type: "duplicate-shot", id: "shot-2" });
    expect(copied.shots[1].id).toBe("shot-7");
    expect(copied.shots[1].title).toContain("(copy)");
    const removed = animePreviewReducer(copied, { type: "remove-shot", id: "shot-7" });
    const appended = animePreviewReducer(removed, { type: "add-shot" });
    expect(appended.shots.at(-1)?.id).toBe("shot-8");
    expect(new Set(appended.shots.map(shot => shot.id)).size).toBe(appended.shots.length);
  });

  it("enforces the prototype shot limit for additions and duplicates", () => {
    let project = createAnimePreview();
    for (let i = 0; i < 20; i++) project = animePreviewReducer(project, { type: "add-shot" });
    expect(project.shots).toHaveLength(MAX_ANIME_SHOTS);
    expect(animePreviewReducer(project, { type: "duplicate-shot", id: "shot-1" })).toBe(project);
    expect(animePreviewReducer(project, { type: "add-shot" })).toBe(project);
  });

  it("handles an empty storyboard and can add a new shot afterward", () => {
    let project = createAnimePreview();
    for (const shot of project.shots) project = animePreviewReducer(project, { type: "remove-shot", id: shot.id });
    expect(project.shots).toHaveLength(0);
    expect(animePreviewReducer(project, { type: "add-shot" }).shots).toHaveLength(1);
  });

  it("keeps cast, environment, and sound preferences in the exported plan", () => {
    let project = createAnimePreview();
    project = animePreviewReducer(project, { type: "edit-character", id: "mira", changes: { name: "Lina", locked: false, voice: "Soft / reflective" } });
    project = animePreviewReducer(project, { type: "edit-location", id: "city", changes: { name: "Lunar city" } });
    project = animePreviewReducer(project, { type: "sound", narration: true, music: "No music" });
    const exported = animePreviewExport(project);
    expect(exported.kind).toBe("anime-studio-static-plan");
    expect(exported.project.characters[0]).toMatchObject({ name: "Lina", locked: false, voice: "Soft / reflective" });
    expect(exported.project.locations[0].name).toBe("Lunar city");
    expect(exported.project).toMatchObject({ narration: true, music: "No music" });
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });

  it("reloads a separate sample without leaking previous in-memory edits", () => {
    const first = createAnimePreview(); first.characters[0].name = "Changed";
    const reloaded = animePreviewReducer(first, { type: "load", brief: { ...defaultAnimeBrief, mode: "clip", targetSeconds: 10 } });
    expect(reloaded.characters[0].name).toBe("Mira");
    expect(reloaded.shots).toHaveLength(3);
    expect(reloaded.nextShotId).toBe(4);
  });
});

describe("static Anime Studio UI", () => {
  it("renders an accessible prototype with a six-shot board and no credit claims", () => {
    const doc = load(renderToStaticMarkup(createElement(AnimeStudio)));
    expect(doc("h1")).toHaveLength(1);
    expect(doc("form[aria-label='Anime project brief']")).toHaveLength(1);
    expect(doc("nav[aria-label='Anime project sections'] button")).toHaveLength(6);
    expect(doc("button[aria-label^='Select shot ']")).toHaveLength(6);
    expect(doc("label[for='anime-shot-title']").text()).toBe("Shot title");
    expect(doc("input#anime-project-title").attr("required")).toBeDefined();
    expect(doc("button[type='submit']").text()).toContain("Open sample episode");
    expect(doc.text()).toContain("Static preview · No credits used");
    expect(doc.text()).toContain("AI engines not connected");
    expect(doc.text()).toContain("not an AI result from your prompt");
    expect(doc("[role='status']")).toHaveLength(1);
    expect(doc("video,audio,iframe")).toHaveLength(0);
  });

  it("makes the prototype discoverable without advertising a live generation feature", () => {
    const doc = load(renderToStaticMarkup(createElement(AnimePreviewCard)));
    expect(doc("article").attr("data-availability")).toBe("static-preview");
    expect(doc("a").attr("href")).toBe("/studio/anime");
    expect(doc.text()).toContain("No credits used");
  });

  it("gives repeated concept illustrations distinct accessible SVG IDs", () => {
    const doc = load(renderToStaticMarkup(createElement("div", null, createElement(AnimeArt), createElement(AnimeArt, { scene: "bridge" }))));
    const ids = doc("[id]").map((_, element) => doc(element).attr("id")).get();
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc("svg[role='img'] title")).toHaveLength(2);
    expect(doc("svg title").text()).toContain("static concept art");
  });

  it("contains no backend actions, network integrations, persistent storage, or competitor assets", () => {
    const client = readFileSync("src/components/studio/anime-studio.tsx", "utf8");
    const data = readFileSync("src/lib/anime/preview.ts", "utf8");
    expect(client + data).not.toMatch(/fetch\(|localStorage|sessionStorage|@fal-ai|@trigger\.dev|@supabase|\/api\/|use server|mkanime\.ai/);
    const page = readFileSync("src/app/studio/anime/page.tsx", "utf8");
    expect(page).toContain('redirect("/login?next=/studio/anime")');
    expect(page).toContain("index: false");
    expect(page).not.toMatch(/createClient|\.from\(|from\s+["'][^"']*actions/);
  });
});
