// Verified against fal's public endpoint schemas on 2026-10-03.
// These are ETA credit rates, not quoted fal dollar prices. Keep SQL rate card in sync.
const model = (name: string, endpoint: string, adapter: string, resolution: "720p" | "768p" | "1080p", creditsPerSecond: number, description: string) => ({
  name, endpoint, adapter, inputMode: "image" as const, resolutions: [resolution], defaultResolution: resolution, creditsPerSecond, description,
});
export const filmModels = {
  "film-kling-o3": model("Kling O3 Pro", "fal-ai/kling-video/o3/pro/reference-to-video", "kling", "720p", 12, "Cast references + opening frame. Recommended for recurring characters."),
  "film-kling-v3-pro": model("Kling 3.0 Pro", "fal-ai/kling-video/v3/pro/image-to-video", "kling", "1080p", 15, "Character elements, camera direction and native sound."),
  "film-kling-v3-standard": model("Kling 3.0 Standard", "fal-ai/kling-video/v3/standard/image-to-video", "kling", "720p", 10, "A lower-cost Kling option with image-guided motion."),
  "film-minimax-h3": model("MiniMax H3 Max", "minimax/h3-max/image-to-video", "minimax", "768p", 8, "Cinematic motion and native audio from a directed opening frame."),
  "film-minimax-h3-turbo": model("MiniMax H3 Max Turbo", "minimax/h3-max-turbo/image-to-video", "minimax", "768p", 5, "Budget-friendly first pass with native sound."),
  "film-seedance-2.5": model("Seedance 2.5", "bytedance/seedance-2.5/image-to-video", "seedance", "1080p", 80, "Premium image-guided generation with synchronized audio."),
  "film-seedance-2-fast": model("Seedance 2.0 Fast", "bytedance/seedance-2.0/fast/image-to-video", "seedance", "720p", 25, "A faster Seedance option for story experiments."),
  "film-veo-3.1": model("Veo 3.1", "fal-ai/veo3.1/image-to-video", "veo", "1080p", 30, "Detailed image-guided scenes and native sound."),
  "film-veo-3.1-fast": model("Veo 3.1 Fast", "fal-ai/veo3.1/fast/image-to-video", "veo", "1080p", 18, "Faster Veo generation with the same eight-second shot workflow."),
  "film-grok-1.5": model("Grok Imagine 1.5", "xai/grok-imagine-video/v1.5/image-to-video", "grok", "1080p", 12, "Image-to-video with generated dialogue and ambience."),
  "film-wan-3": model("Wan 3.0", "alibaba/wan-3.0/image-to-video", "wan", "1080p", 15, "Opening-frame control with generated audio and prompt expansion."),
  "film-happy-horse": model("Happy Horse 1.1", "alibaba/happy-horse/v1.1/image-to-video", "horse", "1080p", 15, "An alternative for image-guided cinematic scenes."),
  "film-ltx-2.3": model("LTX 2.3 Pro", "fal-ai/ltx-2.3/image-to-video", "ltx", "1080p", 6, "1080p image-guided video with native audio."),
  "film-ltx-2.3-fast": model("LTX 2.3 Fast", "fal-ai/ltx-2.3/image-to-video/fast", "ltx", "1080p", 5, "A lower-cost 1080p option for testing a story."),
  "film-pixverse-v6": model("PixVerse V6", "fal-ai/pixverse/v6/image-to-video", "pixverse", "1080p", 10, "Image-guided motion with optional generated audio."),
  "film-gemini-omni": model("Gemini Omni Flash", "google/gemini-omni-flash/image-to-video", "omni", "720p", 20, "Image-guided video. Export normalized to 720p."),
} as const;
export type FilmModel = keyof typeof filmModels;
export const filmModelIds = Object.keys(filmModels) as [FilmModel, ...FilmModel[]];
export function isFilmModel(value: string): value is FilmModel { return Object.hasOwn(filmModels, value); }
export const filmLooks = { cinematic: "Cinematic realism", noir: "Black & white noir", scifi: "Science fiction", fantasy: "Storybook fantasy", anime: "Anime", "3d": "Cinematic 3D" } as const;
export const filmLookPrompts = {
  cinematic: "photorealistic cinematic short film, natural skin texture, motivated soft lighting, restrained warm highlights and cool shadows, 35mm lens language",
  noir: "black-and-white film noir, deep shadows, practical light sources, expressive chiaroscuro, fine film grain",
  scifi: "grounded cinematic science fiction, coherent practical environments, restrained cool palette and warm practical lights",
  fantasy: "cinematic storybook fantasy, tactile materials, soft atmospheric light, coherent magical world",
  anime: "cinematic hand-drawn anime, controlled linework, expressive restrained acting, consistent cel shading",
  "3d": "cinematic 3D animation, tactile materials, expressive characters, physically motivated lighting",
} as const;
export const FILM_PLAN_CREDITS = 40;
export const FILM_FRAME_CREDITS = 10;
export const filmDurations = [24, 48, 60, 120, 180] as const;
export type FilmDuration = typeof filmDurations[number];
// Six and eight seconds are supported by every film adapter, including Veo/LTX.
// Replace a remainder of four with two six-second shots, never pad a short clip.
export function filmShotDurations(duration: number): number[] {
  if (!(filmDurations as readonly number[]).includes(duration)) throw new Error("Choose a 24, 48, 60, 120 or 180 second film.");
  const shortEnding = duration % 8 === 4;
  return [...Array<number>(Math.floor(duration / 8) - (shortEnding ? 1 : 0)).fill(8), ...(shortEnding ? [6, 6] : [])];
}
export function filmRenderCredits(model: FilmModel, duration: number) {
  return duration * filmModels[model].creditsPerSecond + filmShotDurations(duration).length * FILM_FRAME_CREDITS;
}
