import type { CartoonProjectView } from "./schema";

export const cartoonDemo: CartoonProjectView = {
  id: "demo", title: "The marshmallow moon", status: "ready",
  brief: { prompt: "A tiny fox astronaut and a nervous robot discover a marshmallow moon.", style: "3d", duration: 15, aspectRatio: "16:9", model: "kling-o3", references: [], rightsConfirmed: true },
  storyboard: { title: "The marshmallow moon", synopsis: "An impulsive explorer and a cautious robot discover that curiosity is sweeter when shared.",
    characters: [
      { id: "c1", name: "Nova", appearance: "A small orange fox with a cream muzzle, blue spacesuit and clear bubble helmet.", personality: "Curious and delightfully impulsive", voice: "Warm, bright, youthful English voice", referenceSlot: 0 },
      { id: "c2", name: "Bolt", appearance: "A round cream robot with blue eyes, small antenna and short metal legs.", personality: "Cautious but secretly adventurous", voice: "Soft, slightly robotic baritone English voice", referenceSlot: 0 },
    ], scenes: [
      { title: "A soft landing", duration: 5, characterIds: ["c1", "c2"], setting: "A fluffy white moon beneath a deep blue star field.", action: "Nova steps out of the rocket and bounces. Bolt catches her backpack.", camera: "Wide establishing shot, slow push in", sound: "Gentle bounce and soft rocket hiss", dialogue: [{ characterId: "c1", text: "This moon feels like a marshmallow!" }] },
      { title: "One small bite", duration: 5, characterIds: ["c1", "c2"], setting: "Beside a rounded crater on the marshmallow moon.", action: "Nova reaches toward a fluffy rock. Bolt raises a warning finger.", camera: "Medium two-shot, eye level", sound: "Light playful chime", dialogue: [{ characterId: "c2", text: "Please do not eat our landing pad." }] },
      { title: "Better together", duration: 5, characterIds: ["c1", "c2"], setting: "The rocket ramp overlooking the glowing moon.", action: "Nova offers Bolt a tiny marshmallow pebble. They laugh together.", camera: "Close two-shot pulling back to the stars", sound: "Warm laughter and a gentle musical finish", dialogue: [{ characterId: "c1", text: "Just a little taste of adventure!" }] },
    ] }, castUrls: {}, outputUrl: null, error: null, job: null,
};
