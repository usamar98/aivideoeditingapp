import { filmDemo } from "@/lib/films/demo";
import { filmShotDurations, type FilmDuration } from "@/lib/films/models";
import type { CartoonStory } from "@/lib/cartoons/schema";

export function longFilmStory(duration: FilmDuration = 180): CartoonStory {
  const story = structuredClone(filmDemo.storyboard!);
  story.filmBible = {
    logline: "A lighthouse keeper restores the light during a blackout.",
    ending: "Mara lights the tower and sees a fishing boat reach the harbor.",
    worldRules: "Blue hour throughout, warm brass lantern, navy coat and rust scarf. Movement left to right; no weather or wardrobe changes.",
    locations: [{ id: "l1", description: "A circular stone lighthouse workshop with a wooden table on the left and spiral stairs to the right." }, { id: "l2", description: "The lantern room above the workshop, brass lens in the center, harbor visible to the right." }],
    props: [{ id: "p1", description: "Small dented brass lantern with amber light and a black handle." }],
  };
  const durations = filmShotDurations(duration);
  story.scenes = durations.map((seconds, i) => ({
    ...structuredClone(filmDemo.storyboard!.scenes[Math.min(2, Math.floor(i / durations.length * 3))]),
    duration: seconds, dialogue: [],
    continuity: {
      beat: i < durations.length / 3 ? "setup" : i < durations.length * 2 / 3 ? "escalation" : "payoff",
      locationId: i === durations.length - 1 ? "l2" : "l1",
      transition: i === 0 || i === durations.length - 1 ? "cut" : "continue",
      stateIn: `Mara holds the brass lantern; story checkpoint ${i} is complete.`,
      stateOut: `Mara holds the brass lantern; story checkpoint ${i + 1} is complete.`, propIds: ["p1"],
    },
  }));
  return story;
}
