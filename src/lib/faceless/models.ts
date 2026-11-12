export const facelessImageModelIds = ["flux-3-klein", "nano-banana-2.1"] as const;
export type FacelessImageModel = (typeof facelessImageModelIds)[number];
export const DEFAULT_FACELESS_IMAGE_MODEL: FacelessImageModel = "flux-3-klein";
export const FACELESS_IMAGE_OPTIONS = [
  { value: "flux-3-klein", label: "FLUX.3 Klein · Fast" },
  { value: "nano-banana-2.1", label: "Nano Banana 2.1 · Detailed" },
] satisfies { value: FacelessImageModel; label: string }[];

export const facelessImageEndpoints = {
  "flux-3-klein": "blackforestlabs/flux-3/klein/text-to-image",
  "nano-banana-2.1": "google/nano-banana-2.1",
} as const satisfies Record<FacelessImageModel, string>;

// Jobs created before image selection was introduced already have Schnell checkpoints.
export const LEGACY_FACELESS_ENDPOINT = "fal-ai/flux/schnell";

export function facelessImageRequest(model: FacelessImageModel | undefined, aspectRatio: "9:16" | "16:9", prompt: string) {
  const common = { prompt, num_images: 1, output_format: "jpeg" } as const;
  if (model === "nano-banana-2.1") {
    return { endpoint: facelessImageEndpoints[model], input: { ...common, aspect_ratio: aspectRatio, resolution: "1K" } };
  }
  return {
    endpoint: model ? facelessImageEndpoints[model] : LEGACY_FACELESS_ENDPOINT,
    input: {
      ...common,
      image_size: aspectRatio === "9:16" ? "portrait_16_9" : "landscape_16_9",
      enable_safety_checker: true,
    },
  };
}
