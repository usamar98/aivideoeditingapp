import "server-only";

import { fal } from "@fal-ai/client";

const klingDurations = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;

function configureFal() {
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error("fal.ai is unavailable: FAL_KEY is not configured.");
  fal.config({ credentials });
}

export async function submitStoryboardRevision(input: {
  prompt: string;
  imageUrls: string[];
}) {
  configureFal();
  return fal.queue.submit("fal-ai/nano-banana-pro/edit", {
    input: {
      prompt: input.prompt,
      image_urls: input.imageUrls,
      num_images: 1,
      output_format: "png",
    },
  });
}

export async function submitSceneAnimation(input: {
  prompt: string;
  startImageUrl: string;
  durationSeconds: number;
  characterElements: Array<{ frontal_image_url: string; reference_image_urls: string[] }>;
}) {
  configureFal();
  if (input.durationSeconds < 3 || input.durationSeconds > 15) {
    throw new Error("Kling v3 Pro scenes must be between 3 and 15 seconds.");
  }
  const duration = klingDurations.find((value) => value === String(Math.round(input.durationSeconds)));
  if (!duration) throw new Error("Kling v3 Pro duration must resolve to a whole number of seconds.");
  return fal.queue.submit("fal-ai/kling-video/v3/pro/image-to-video", {
    input: {
      prompt: input.prompt,
      start_image_url: input.startImageUrl,
      duration,
      generate_audio: false,
      elements: input.characterElements,
      shot_type: "customize",
      negative_prompt: "identity drift, character redesign, blur, distortion, low quality",
      cfg_scale: 0.5,
    },
  });
}
