import type { CartoonProjectView } from "../cartoons/schema";

export const filmDemo: CartoonProjectView = {
  id: "demo", title: "The last light", status: "ready", castUrls: {}, outputUrl: null, error: null, job: null,
  brief: { kind: "short-film", prompt: "An elderly lighthouse keeper finds a tiny light inside a broken lantern. She carries it up the dark stairs and brings the lighthouse back to life.", style: "cinematic", duration: 24, aspectRatio: "16:9", model: "film-kling-o3", resolution: "720p", audio: true, references: [], rightsConfirmed: true },
  storyboard: {
    title: "The last light", synopsis: "During a coastal blackout, a lighthouse keeper discovers a flicker of hope and carries it back to the tower.",
    filmBible: {
      logline: "A lighthouse keeper carries a tiny light through the dark to guide the harbor home.",
      ending: "Mara restores the lighthouse beam and watches it sweep across the dark harbor.",
      worldRules: "Blue hour, cold blue shadows and a warm amber lantern. Mara keeps her navy coat, rust scarf and silver braid. Movement stays left to right; no time or weather jump.",
      locations: [{ id: "l1", description: "A stone workshop, wooden table on the left and the door to the tower on the right." }, { id: "l2", description: "A narrow stone spiral stair with tall slit windows admitting blue twilight." }, { id: "l3", description: "A glass lantern room with a central brass lens and the dark harbor visible beyond." }],
      props: [{ id: "p1", description: "A dented brass lantern with a black handle and a tiny amber flame." }],
    },
    characters: [{ id: "c1", name: "Mara", appearance: "An elderly woman with a silver braid, a navy wool coat, a rust scarf and weathered hands. She carries an old brass lantern.", personality: "Patient, resourceful and quietly determined", voice: "Warm, low English voice with gentle pacing", referenceSlot: 0 }],
    scenes: [
      { title: "A flicker", duration: 8, continuity: {"beat":"setup","locationId":"l1","transition":"cut","stateIn":"Mara stands in the workshop beside her closed, unlit brass lantern.","stateOut":"Mara holds the opened lantern; its tiny amber light is now burning.","propIds":["p1"]}, characterIds: ["c1"], setting: "A dark lighthouse workshop at blue hour. A single warm oil lamp illuminates the wooden table.", action: "Mara opens a brass lantern. A tiny amber light wakes inside; she cups her hands around it and smiles.", camera: "Slow push-in from medium shot to the lantern and her face; 50mm perspective.", sound: "Distant waves, soft metal hinge and a surprised breath.", dialogue: [] },
      { title: "The climb", duration: 8, continuity: {"beat":"escalation","locationId":"l2","transition":"cut","stateIn":"Mara holds the opened lantern; its tiny amber light is now burning.","stateOut":"Mara has reached the top landing, holding the same glowing lantern.","propIds":["p1"]}, characterIds: ["c1"], setting: "The same lighthouse, a dark spiral staircase; blue twilight enters the narrow windows.", action: "Mara climbs slowly with the glowing lantern held close, then pauses at the top landing.", camera: "Low tracking shot, following left to right, then settle at the landing.", sound: "Measured footsteps, a coat rustle and distant wind.", dialogue: [{characterId:"c1",text:"Almost there."}] },
      { title: "Home again", duration: 8, continuity: {"beat":"payoff","locationId":"l3","transition":"cut","stateIn":"Mara has reached the top landing, holding the same glowing lantern.","stateOut":"The lantern rests at the lens; the lighthouse beam is restored and Mara watches the harbor.","propIds":["p1"]}, characterIds: ["c1"], setting: "The lighthouse lantern room at the same blue hour, overlooking a dark harbor.", action: "Mara places the lantern at the lens. Warm light sweeps across the glass and she watches the harbor with relief.", camera: "Begin on her hands, gently pull back to reveal her silhouette and the harbor.", sound: "A gentle mechanical hum, waves and steady wind; no musical score.", dialogue: [] },
    ],
  },
};
