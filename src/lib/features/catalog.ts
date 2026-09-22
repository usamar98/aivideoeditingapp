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
      "Plan and produce short 3D-style cartoon episodes with reusable characters, approved reference frames, saved voices, and a living series guide.",
    audience: ["Creators", "Educators", "Brands", "Agencies"],
    searchIntent: "Create a repeatable animated series with consistent AI characters",
    benefits: [
      "Reuse approved characters instead of rebuilding them for every episode",
      "Approve storyboard frames before spending credits on animation",
      "Replace one scene while keeping the rest of an episode unchanged",
    ],
    capabilities: [
      "Character profiles and reference image sets",
      "Structured scripts and editable storyboards",
      "Timed narration, captions, scene animation, and MP4 assembly",
      "Landscape and vertical formats",
      "Next-episode planning from an editable recap",
    ],
    limitations: [
      "The first release exports finished video, not editable 3D models or rigs.",
      "Character consistency is reviewed and improved, not guaranteed to be perfect.",
      "Lip-sync is enabled only for character styles that pass quality testing.",
    ],
    exampleMedia: [
      {
        type: "image",
        url: "/demo/weather-workshop.png",
        title: "Pip and Moss test the weather machine",
        description: "An approved storyboard frame from a short narrated cartoon episode.",
        published: true,
      },
    ],
    relatedFeatures: ["ecommerce-product-videos"],
    status: "published",
    publishedAt: "2026-09-22T00:00:00.000Z",
    modifiedAt: "2026-09-22T00:00:00.000Z",
    seo: {
      title: "AI Cartoon Series Maker with Consistent Characters",
      description:
        "Create short 3D-style cartoon episodes with reusable characters, approved storyboards, saved voices, captions, and scene-level control.",
      heading: "Create an AI cartoon series that remembers its cast",
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
