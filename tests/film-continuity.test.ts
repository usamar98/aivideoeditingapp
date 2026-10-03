import { describe, it, expect } from "vitest";
import { z } from "zod";
import { filmDemo } from "@/lib/films/demo";
import { cartoonBriefSchema, cartoonStorySchema, filmStorySchema, validateCartoonStory } from "@/lib/cartoons/schema";
import { filmDurations, filmShotDurations, filmRenderCredits, filmModels } from "@/lib/films/models";
import { filmReferenceShots, filmContinuityPrompt } from "@/lib/films/continuity";
import { filmPlannerPrompt, filmVideoInput } from "@/lib/films/prompts";
import { cartoonPlannerRequest } from "../trigger/cartoon-planner";
import { filmTailArgs, FILM_EXPORT_LIMIT } from "../trigger/cartoon-media";
import { longFilmStory } from "./fixtures/long-film";

describe("long film continuity", () => {
  it.each(filmDurations)("plans exactly %ss without short filler or duration rounding", duration => {
    const schedule = filmShotDurations(duration);
    expect(schedule.reduce((a, b) => a + b, 0)).toBe(duration);
    expect(schedule.every(s => s === 6 || s === 8)).toBe(true);
    const brief = cartoonBriefSchema.parse({ ...filmDemo.brief, duration });
    const story = filmStorySchema.parse(longFilmStory(duration));
    expect(() => validateCartoonStory(story, brief)).not.toThrow();
    expect(filmRenderCredits("film-kling-o3", duration)).toBe(duration * filmModels["film-kling-o3"].creditsPerSecond + schedule.length * 10);
    expect(filmPlannerPrompt(brief)).toContain(JSON.stringify(schedule));
  });
  it("uses 23 shots for 180 seconds and keeps cartoons capped at 60", () => {
    expect(filmShotDurations(180)).toHaveLength(23);
    expect(filmShotDurations(180).slice(-2)).toEqual([6, 6]);
    expect(() => filmShotDurations(181)).toThrow();
    expect(cartoonBriefSchema.safeParse({ ...filmDemo.brief, kind: undefined, model: "kling-o3", duration: 180 }).success).toBe(false);
  });
  const brief = cartoonBriefSchema.parse({ ...filmDemo.brief, duration: 180 });
  it.each(["missing bible", "unknown location", "unknown prop", "state reset", "reordered acts", "missing payoff", "new cast without cut", "new location without cut", "first shot continues"])("rejects %s before paid rendering", issue => {
    const story = longFilmStory();
    switch (issue) {
      case "missing bible": delete story.filmBible; break;
      case "unknown location": story.scenes[0].continuity!.locationId = "l3"; break;
      case "unknown prop": story.scenes[0].continuity!.propIds = ["p5"]; break;
      case "state reset": story.scenes[1].continuity!.stateIn = "Everything starts over again."; break;
      case "reordered acts": story.scenes[0].continuity!.beat = "payoff"; break;
      case "missing payoff": story.scenes.forEach(s => { s.continuity!.beat = "setup"; }); break;
      case "new cast without cut": story.scenes[1].characterIds = ["c2"]; break;
      case "new location without cut": story.scenes[1].continuity!.locationId = "l2"; break;
      case "first shot continues": story.scenes[0].continuity!.transition = "continue";
    }
    expect(() => validateCartoonStory(story, brief)).toThrow();
  });
  it("uses immutable first-location anchors and the previous final frame only for a continuation", () => {
    const story = longFilmStory();
    expect(filmReferenceShots(story, 0)).toEqual({ location: -1, previous: -1 });
    expect(filmReferenceShots(story, 8)).toEqual({ location: 0, previous: 7 });
    expect(filmReferenceShots(story, 22)).toEqual({ location: -1, previous: -1 });
    const prompt = filmContinuityPrompt(story, 8);
    expect(prompt).toContain("Image 2 is the original location");
    expect(prompt).toContain("Image 3 is the preceding shot");
    expect(prompt).toContain("authoritative for faces and wardrobe");
    expect(prompt).toContain(story.scenes[8].continuity!.stateIn);
  });
  it("requests required film continuity fields but no optional film fields for cartoon generation", () => {
    const schema = cartoonPlannerRequest([], true).response_format.json_schema.schema;
    expect(schema).toEqual(z.toJSONSchema(filmStorySchema, { target: "draft-7" }));
    expect(schema.required).toContain("filmBible");
    expect(cartoonPlannerRequest([]).response_format.json_schema.schema.properties).not.toHaveProperty("filmBible");
    expect(cartoonStorySchema.safeParse(filmDemo.storyboard).success).toBe(true);
  });
  it("preserves end-state instructions within provider prompt bounds and extracts the final displayed frame", () => {
    const story = longFilmStory();
    const scene = story.scenes[0];
    scene.continuity!.stateOut = "x".repeat(240);
    expect(String(filmVideoInput(scene, story, brief, "https://fal.media/frame.png", [], "user").input.prompt)).toContain(scene.continuity!.stateOut);
    expect(filmTailArgs(22, 6)).toContain("5.958333333333333");
    expect(filmTailArgs(22, 6).at(-1)).toBe("tail-22.png");
    expect(FILM_EXPORT_LIMIT).toBeLessThan(500 * 1024 * 1024);
  });
});
