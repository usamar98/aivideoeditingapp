import { z } from "zod";

export const briefSchema = z.object({
  mode: z.enum(["idea", "script"]), topic: z.string().trim().min(12).max(1800),
  duration: z.union([z.literal(30), z.literal(60)]), aspectRatio: z.enum(["9:16", "16:9"]),
  style: z.enum(["Cinematic", "Illustration", "Watercolor"]), tone: z.enum(["Informative", "Storytelling", "Inspiring"]),
  language: z.enum(["en", "es", "fr"]), captions: z.boolean(),
});
export const storyboardSchema = z.object({ title: z.string().min(3).max(100), scenes: z.array(z.object({ narration: z.string().trim().min(5).max(450), visualPrompt: z.string().trim().min(10).max(1000) })).min(2).max(8) });
export type FacelessBrief = z.infer<typeof briefSchema>;
export type FacelessStoryboard = z.infer<typeof storyboardSchema>;
export type FacelessProject = { id: string; title: string; brief: FacelessBrief; storyboard: FacelessStoryboard | null; status: "draft"|"planning"|"ready"|"rendering"|"complete"|"failed"; generation_id: string|null; output_path: string|null; error_message: string|null };
export const defaultBrief: FacelessBrief = {mode:"idea",topic:"",duration:30,aspectRatio:"9:16",style:"Cinematic",tone:"Informative",language:"en",captions:true};
export const sampleStoryboard: FacelessStoryboard = {title:"A little closer to the stars",scenes:[
  {narration:"Look up at the night sky. Every point of light has a story that began long before this moment.",visualPrompt:"A cinematic wide view of a mountain lake under a clear star-filled night sky, no people, no text"},
  {narration:"Starlight travels enormous distances before it reaches us. Looking into space is also looking into the past.",visualPrompt:"An expansive field of distant stars and softly glowing nebulae, deep blue tones, no text"},
  {narration:"So next time you step outside, take a quiet moment. There is a much bigger story above you.",visualPrompt:"A peaceful silhouetted mountain ridge under the Milky Way, a gentle glow on the horizon, no text"},
]};
export function validateNarration(storyboard: FacelessStoryboard, duration: number) {
  const words = storyboard.scenes.reduce((count, scene) => count + scene.narration.split(/\s+/).length,0);
  if (words > (duration === 30 ? 80 : 155)) throw new Error(`Keep narration under ${duration === 30 ? 80 : 155} words for this format.`);
}
export function scriptToStoryboard(brief: FacelessBrief): FacelessStoryboard {
  const words = brief.topic.split(/\s+/);
  if (words.length < 12) throw new Error("Add at least 12 words to your script.");
  const size = Math.ceil(words.length / (brief.duration === 30 ? 3 : 6));
  const scenes = [];
  for (let i=0; i<words.length; i+=size) { const narration = words.slice(i,i+size).join(" "); scenes.push({narration,visualPrompt:`${brief.style} visual illustrating: ${narration}. No text or on-screen presenter.`}); }
  const storyboard = storyboardSchema.parse({title:words.slice(0,8).join(" "),scenes});
  validateNarration(storyboard,brief.duration);
  return storyboard;
}
