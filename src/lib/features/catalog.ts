import { z } from "zod";

export const featureStatusSchema = z.enum(["draft", "published", "unavailable", "retired"]);

export const featureDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(3),
  description: z.string().min(30),
  audience: z.array(z.string()).min(1),
  searchIntent: z.string().min(5),
  benefits: z.array(z.string()).min(1),
  capabilities: z.array(z.string()).min(1),
  limitations: z.array(z.string()).min(1),
  exampleMedia: z
    .array(
      z.object({
        type: z.enum(["image", "video"]),
        url: z.string().startsWith("/"),
        title: z.string(),
        description: z.string(),
        transcript: z.string().optional(),
        thumbnailUrl: z.string().startsWith("/").optional(),
        publishedAt: z.string().datetime().optional(),
        durationIso: z.string().regex(/^PT(?=\d|\d+[HMS])(?:\d+H)?(?:\d+M)?(?:\d+S)?$/).optional(),
        published: z.boolean(),
      }),
    )
    .default([]),
  relatedFeatures: z.array(z.string()),
  status: featureStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  modifiedAt: z.string().datetime(),
  seo: z.object({
    title: z.string().max(65),
    description: z.string().max(165),
    heading: z.string(),
    canonicalPath: z.string().startsWith("/"),
    editorialOverride: z.boolean(),
  }),
  developmentOnly: z.boolean().default(false),
});

export type FeatureDefinition = z.infer<typeof featureDefinitionSchema>;

export const featureCatalog: FeatureDefinition[] = [
  featureDefinitionSchema.parse({
    slug: "ai-cartoon-series",
    name: "AI cartoon series",
    description:
      "Turn a prompt or uploaded character artwork into a short animated film with AI-designed characters, editable actions, spoken dialogue, and a private MP4.",
    audience: ["Creators", "Educators", "Brands", "Agencies"],
    searchIntent: "Create a repeatable animated series with consistent AI characters",
    benefits: [
      "Use polished character references throughout your film",
      "Review your cast and editable story before paying for animation",
      "Start with an original prompt or your own character artwork",
    ],
    capabilities: [
      "Up to three AI-designed or image-guided characters using GPT Image 2.5 Sunburst on fal",
      "Editable scene actions, camera directions, sound and dialogue",
      "Kling O3 Pro native-audio animation, with optional Seedance 2.5 access",
      "15-, 30- and 60-second films in landscape or vertical 720p",
      "Saved projects, background progress, cancellation and private downloads",
    ],
    limitations: [
      "The first release exports finished video, not editable 3D models or rigs.",
      "Character consistency is reviewed and improved, not guaranteed to be perfect.",
      "English dialogue and generated lip sync can vary; exact words and voice continuity are not guaranteed. Review before publishing.",
      "Live generation requires a migrated database, deployed cartoon worker, provider access and credits. No automatic captions, editable rigs or per-scene rerendering in this release.",
    ],
    exampleMedia: [
      {
        type: "image",
        url: "/demo/weather-workshop.png",
        title: "Pip and Moss test the weather machine",
        description: "Illustrative cartoon artwork; not a live generation result.",
        published: true,
      },
    ],
    relatedFeatures: ["faceless-video-generator"],
    status: "published",
    publishedAt: "2026-09-22T00:00:00.000Z",
    modifiedAt: "2026-09-22T00:00:00.000Z",
    seo: {
      title: "AI Cartoon Series Maker with Consistent Characters",
      description:
        "Create AI cartoon videos from prompts or character images. Review your cast, edit actions and dialogue, then animate with fal models and download your film.",
      heading: "Your characters. Their next adventure. One prompt.",
      canonicalPath: "/features/ai-cartoon-series",
      editorialOverride: true,
    },
    developmentOnly: false,
  }),
  featureDefinitionSchema.parse({
    slug: "ecommerce-product-videos",
    name: "Ecommerce product videos",
    description:
      "A development-only catalog fixture proving that feature pages, metadata, links, and sitemap rules come from shared typed content.",
    audience: ["Ecommerce teams"],
    searchIntent: "Turn approved product assets into short commerce videos",
    benefits: ["Reuse product assets and brand rules"],
    capabilities: ["Planned product-focused video workflows"],
    limitations: ["This capability is not available yet and must not be marketed as released."],
    exampleMedia: [],
    relatedFeatures: ["ai-cartoon-series"],
    status: "draft",
    publishedAt: null,
    modifiedAt: "2026-09-22T00:00:00.000Z",
    seo: {
      title: "Ecommerce Product Videos — Preview",
      description: "Development preview for the shared feature publishing system.",
      heading: "Ecommerce product videos",
      canonicalPath: "/features/ecommerce-product-videos",
      editorialOverride: false,
    },
    developmentOnly: true,
  }),
];

featureCatalog.push(featureDefinitionSchema.parse({
  slug: "faceless-video-generator", name: "Faceless video generator",
  description: "Turn a topic or your own script into a narrated short with editable scenes, AI-generated images, timed captions, and a private MP4 download.",
  audience: ["Creators", "Educators", "Small teams"], searchIntent: "Create narrated videos without appearing on camera",
  benefits: ["Start with an idea or preserve your own script", "Review narration and visual prompts before rendering", "Return to saved projects and private exports"],
  capabilities: ["AI script planning and editable scene ordering", "Cinematic, illustration, and watercolor image prompts", "English, Spanish, and French narration with a configured studio voice", "Vertical and landscape MP4 export with optional burned-in captions"],
  limitations: ["Uses narrated AI still images, not generative moving footage.", "Live generation requires connected providers, a deployed worker, and credits.", "No social auto-posting, background music, or stock footage library in this release. Review factual claims before publishing."],
  relatedFeatures: ["ai-cartoon-series"], status: "published", publishedAt: "2026-09-22T00:00:00.000Z", modifiedAt: "2026-09-22T00:00:00.000Z",
  seo: {title: "Faceless Video Generator — Script to Narrated Video", description: "Create faceless shorts from ideas or scripts. Edit scenes, generate AI visuals and narration, add timed captions, and export a private MP4.", heading: "Your story. Your voice. No camera required.", canonicalPath: "/features/faceless-video-generator", editorialOverride: true}, developmentOnly:false,
}));

export function getPublishedFeatures() {
  return featureCatalog.filter(
    (feature) => feature.status === "published" && !feature.developmentOnly,
  );
}

export function getFeature(slug: string) {
  return featureCatalog.find((feature) => feature.slug === slug);
}

export function canIndexFeature(feature: FeatureDefinition) {
  return feature.status === "published" && !feature.developmentOnly;
}
