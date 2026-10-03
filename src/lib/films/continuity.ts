import { z } from "zod";
import type { CartoonStory } from "../cartoons/schema";

export const filmBibleSchema = z.object({
  logline: z.string().min(10).max(300),
  ending: z.string().min(10).max(300),
  worldRules: z.string().min(10).max(600),
  locations: z.array(z.object({ id: z.string().regex(/^l[1-3]$/), description: z.string().min(10).max(350) })).min(1).max(3),
  props: z.array(z.object({ id: z.string().regex(/^p[1-5]$/), description: z.string().min(5).max(200) })).max(5),
});
export const filmContinuitySchema = z.object({
  beat: z.enum(["setup", "escalation", "payoff"]),
  locationId: z.string().regex(/^l[1-3]$/),
  transition: z.enum(["cut", "continue"]),
  stateIn: z.string().min(10).max(240),
  stateOut: z.string().min(10).max(240),
  propIds: z.array(z.string().regex(/^p[1-5]$/)).max(5),
});

// Structural checks, not a claim that generated pixels have passed visual QA.
export function validateFilmContinuity(story: CartoonStory, required: boolean) {
  const bible = story.filmBible;
  if (!bible && !required && story.scenes.every(s => !s.continuity)) return; // Existing short projects.
  if (!bible) throw new Error("This film needs a story and world bible before rendering.");
  const locations = bible.locations.map(l => l.id), props = bible.props.map(p => p.id);
  if (new Set(locations).size !== locations.length || new Set(props).size !== props.length) throw new Error("Location and prop IDs must be unique.");
  const beats = ["setup", "escalation", "payoff"];
  const seen = new Set<string>();
  let previousBeat = 0;
  for (const [i, scene] of story.scenes.entries()) {
    const c = scene.continuity, previous = story.scenes[i - 1];
    if (!c || !locations.includes(c.locationId) || c.propIds.some(id => !props.includes(id)) || new Set(c.propIds).size !== c.propIds.length) throw new Error(`Shot ${i + 1} has missing or unknown continuity references.`);
    const beat = beats.indexOf(c.beat);
    if (beat < previousBeat) throw new Error("Keep the story in setup, escalation, then payoff order.");
    previousBeat = beat; seen.add(c.beat);
    if (previous && c.stateIn !== previous.continuity?.stateOut) throw new Error(`Shot ${i + 1} must start with the preceding shot’s exact ending state.`);
    if (c.transition === "continue" && (!previous || c.locationId !== previous.continuity?.locationId || [...scene.characterIds].sort().join() !== [...previous.characterIds].sort().join())) throw new Error(`Shot ${i + 1} needs a cut when the location or visible cast changes.`);
  }
  if (beats.some(beat => !seen.has(beat))) throw new Error("The film needs a setup, escalation and resolved payoff.");
}

/** Reuse the FIRST location frame rather than recursively drifting the world. */
export function filmReferenceShots(story: CartoonStory, index: number) {
  const continuity = story.scenes[index]?.continuity;
  if (!continuity) return { location: -1, previous: -1 };
  const location = story.scenes.findIndex((s, i) => i < index && s.continuity?.locationId === continuity.locationId);
  return { location, previous: continuity.transition === "continue" && index > 0 ? index - 1 : -1 };
}

export function filmContinuityPrompt(story: CartoonStory, index: number) {
  const scene = story.scenes[index], c = scene?.continuity, bible = story.filmBible;
  if (!c || !bible) return "";
  const refs = filmReferenceShots(story, index);
  let image = scene.characterIds.length;
  return `PRODUCTION BIBLE (fixed): ${bible.worldRules}. Location ${c.locationId}: ${bible.locations.find(l => l.id === c.locationId)!.description}. Recurring props: ${bible.props.filter(p => c.propIds.includes(p.id)).map(p => p.description).join("; ") || "none"}. Story beat: ${c.beat}. START STATE: ${c.stateIn}. END STATE after the action: ${c.stateOut}. ${refs.location >= 0 ? `Image ${++image} is the original location reference: preserve its layout, palette and lighting, not its character poses.` : "Establish this location clearly."} ${refs.previous >= 0 ? `Image ${++image} is the preceding shot’s last frame: continue positions, eyelines and prop placement from it.` : "Intentional camera cut; stage the start state."} The first ${scene.characterIds.length} cast images are always authoritative for faces and wardrobe; never copy identity drift from scene references.`;
}
