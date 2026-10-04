import { z } from "zod";

export const featureStatusSchema = z.enum(["draft", "published", "unavailable", "retired"]);

export function isPublicMediaPath(path: string) {
  return /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm)$/i.test(path)
    && !/^\/(?:api|auth|studio|admin)(?:\/|$)/i.test(path);
}

const publicMediaPath = z.string().refine(isPublicMediaPath, "Use a public, local media file path without redirects, query strings or traversal.");

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
        url: publicMediaPath,
        title: z.string(),
        description: z.string(),
        transcript: z.string().optional(),
        thumbnailUrl: publicMediaPath.optional(),
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
    canonicalPath: z.string().regex(/^\/features\/[a-z0-9-]+$/),
    editorialOverride: z.boolean(),
  }),
  developmentOnly: z.boolean().default(false),
}).refine((feature) => feature.seo.canonicalPath === `/features/${feature.slug}`, {
  message: "The canonical must match the feature's public route.", path: ["seo", "canonicalPath"],
});

export type FeatureDefinition = z.infer<typeof featureDefinitionSchema>;

export const featureCatalog: FeatureDefinition[] = [
  featureDefinitionSchema.parse({
    slug: "ai-real-estate-video-generator", name: "Real estate video generator",
    description: "Turn real listing photos into a branded property tour. Arrange rooms, choose faithful photo motion or eight AI video models, add optional narration, and export a private MP4.",
    audience: ["Real estate agents", "Property photographers", "Agencies"], searchIntent: "Create real estate listing videos from property photos",
    benefits: ["Build a room-by-room tour from real property photos", "Review facts and credit cost before rendering", "Finish with your agency branding and contact card"],
    capabilities: ["Two to twelve private photo uploads with room labels and reorder controls", "Faithful photo motion plus Kling 3.0, Seedance 2.5, Veo 3.1, Wan 3.0 and LTX 2.3 variants", "Six or eight seconds per photo plus a four-second contact card: 16–100 seconds total", "Optional English ElevenLabs v3 narration and room-timed SRT downloads", "Portrait or landscape 1080p MP4 canvas with aspect-preserving padding", "Saved projects, durable room checkpoints, progress and cancellation"],
    limitations: ["AI motion can alter architecture or objects. Compare every generated room with the originals; AI exports carry a visible disclosure.", "No virtual staging, music, MLS import, automatic posting or continuous 3D walkthrough. SRT captions are not burned in.", "Export resolution is not a guarantee of native model detail; Seedance uses a 720p source configuration.", "Requires the real-estate database migration, deployed worker and credits. fal access is needed for AI motion or narration; silent faithful mode does not call fal."],
    exampleMedia: [], relatedFeatures: ["ai-short-film-generator", "ai-ugc-product-ads", "podcast-to-shorts"], status: "published",
    publishedAt: "2026-10-04T00:00:00.000Z", modifiedAt: "2026-10-04T00:00:00.000Z", developmentOnly: false,
    seo: { title: "AI Real Estate Video Generator from Listing Photos", description: "Create branded real estate videos from listing photos. Arrange rooms, choose photo or AI motion, add narration and export portrait or landscape property tours.", heading: "Real estate videos from your actual listing photos", canonicalPath: "/features/ai-real-estate-video-generator", editorialOverride: true },
  }),
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
      "Model menu: character-reference animation or direct-prompt MiniMax H3 Max Turbo, Kling V3 Pro and optional Seedance 2.5",
      "15-, 30- and 60-second films in landscape or vertical; resolution options depend on the selected model",
      "Saved projects, background progress, cancellation and private downloads",
    ],
    limitations: [
      "Exports finished video, not editable 3D models or rigs. Direct-prompt models skip portraits and do not accept character-image uploads.",
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
    modifiedAt: "2026-09-26T00:00:00.000Z",
    seo: {
      title: "AI Cartoon Video Generator from Prompts & Images",
      description:
        "Create AI cartoon videos from prompts or character images. Review your cast, edit actions and dialogue, then animate with fal models and download your film.",
      heading: "AI cartoon videos from your prompt or character images",
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
  relatedFeatures: ["ai-cartoon-series"], status: "published", publishedAt: "2026-09-22T00:00:00.000Z", modifiedAt: "2026-09-25T00:00:00.000Z",
  seo: {title: "Faceless Video Generator — Script to Narrated Video", description: "Create faceless shorts from ideas or scripts. Edit scenes, generate AI visuals and narration, add timed captions, and export a private MP4.", heading: "Create faceless videos from an idea or your own script", canonicalPath: "/features/faceless-video-generator", editorialOverride: true}, developmentOnly:false,
}));

export function getPublishedFeatures() {
  return featureCatalog.filter(
    (feature) => feature.status === "published" && !feature.developmentOnly,
  );
}

featureCatalog.push(featureDefinitionSchema.parse({
  slug: "ai-ugc-product-ads", name: "AI UGC & product ads",
  description: "Turn product photos or a public product link into UGC-style ads with a fictional AI presenter, original product visuals, timed captions and three editable opening hooks.",
  audience: ["Ecommerce brands", "Performance marketers", "Small businesses", "Agencies"],
  searchIntent: "Create AI presenter product ads from product images or a product URL",
  benefits: ["Review product facts and ad scripts before spending on video", "Test different hooks with the same presenter and shared message", "Keep original product photos visible instead of regenerating packaging"],
  capabilities: ["Public HTTPS product-page import or one to four uploaded product photos", "Four presenter directions with a newly generated fictional adult portrait", "Three editable opening hooks, a shared body and spoken call to action", "Kling AI Avatar v2 Pro on fal with English studio-voice narration", "15- or 30-second MP4s in vertical, square or landscape formats with optional burned-in captions and separate SRT files", "Private saved projects, selected-variant rendering, background progress and cancellation"],
  limitations: ["AI UGC means UGC-style advertising, not a genuine customer review. Every export visibly identifies the AI presenter.", "Product photos appear in a composed layout beside or below the presenter; this does not simulate hands-on product use or a real unboxing.", "Protected or JavaScript-only product pages may require manual photos and details. Check every imported or generated claim before rendering.", "Uses one configured studio voice. No real-person cloning, automatic publishing, ad buying or performance guarantees. Lip sync and generated appearances can vary.", "Live generation requires the UGC migration, deployed worker, fal and ElevenLabs access, and credits."],
  exampleMedia: [], relatedFeatures: ["faceless-video-generator", "ai-cartoon-series"], status: "published", developmentOnly: false,
  publishedAt: "2026-09-25T00:00:00.000Z", modifiedAt: "2026-09-25T00:00:00.000Z",
  seo: { title: "AI UGC Ad Generator — Product Images & Links to Video", description: "Create AI presenter ads from product images or links. Edit three hooks, add product visuals and captions, then export private ad variants with ETA.", heading: "AI UGC and product ads from your images or product link", canonicalPath: "/features/ai-ugc-product-ads", editorialOverride: true },
}));

export function getFeature(slug: string) {
  return featureCatalog.find((feature) => feature.slug === slug);
}

featureCatalog.push(featureDefinitionSchema.parse({
  slug: "ai-short-film-generator", name: "AI short film generator",
  description: "Turn an idea into a cinematic short film. Review your cast and shot plan, direct the action and dialogue, and render a private MP4 with image-guided models on fal.",
  audience: ["Independent filmmakers", "Storytellers", "Creators", "Creative teams"],
  searchIntent: "Create an AI short film from a story with consistent characters and cinematic shots",
  benefits: ["Shape a complete story before paying for the final render", "Reuse approved cast references throughout your film", "Choose a simple production preset or explore 16 fal video models"],
  capabilities: ["24-, 48-, 60-, 120- or 180-second films in landscape or vertical format, automatically assembled from connected shots", "Six visual directions, including cinematic realism, noir, science fiction, fantasy, anime and 3D", "Original cast design or up to three authorized character-image uploads", "Editable written storyboard with a fixed story/world bible, linked continuity states, action, camera and short English dialogue", "Image-guided generation across Kling, MiniMax, Seedance, Veo, Grok, Wan, Happy Horse, LTX, PixVerse and Gemini Omni", "Private MP4 export, visible credit estimates, saved projects, background progress and cancellation"],
  limitations: ["AI character identity, exact speech, voices and motion can vary. There is no guaranteed best model or perfect continuity.", "Written storyboard and cast portraits are reviewed before rendering; scene opening frames are generated during the paid render stage. No full timeline editor or per-shot regeneration in this release.", "Native model sound is not a separate editable soundtrack. No voice cloning, automatic captions or licensed music library.", "720p, 768p or 1080p exports depend on the model. Normalized export size does not guarantee native source resolution.", "Live generation requires the short-film credit migration, updated background worker, fal access and account credits. Models may have provider-specific availability restrictions."],
  exampleMedia: [], relatedFeatures: ["ai-cartoon-series", "faceless-video-generator", "ai-ugc-product-ads"],
  status: "published", developmentOnly: false, publishedAt: "2026-10-03T00:00:00.000Z", modifiedAt: "2026-10-03T00:00:00.000Z",
  seo: { title: "AI Short Film Generator — Story to Cinematic Video", description: "Create AI short films with a reviewed cast, editable shots and 16 fal video models. Choose your look, direct the story and download a private MP4 with ETA.", heading: "Turn your story into an AI short film", canonicalPath: "/features/ai-short-film-generator", editorialOverride: true },
}));

featureCatalog.push(featureDefinitionSchema.parse({
  slug: "ai-digital-clone-presenter", name: "AI digital-clone presenter",
  description: "Create talking presenter videos from an authorized portrait and a short script. Save your presenter once, reuse it with new scripts, and export private videos with a studio voice and captions.",
  audience: ["Creators", "Educators", "Small businesses"], searchIntent: "Create an AI talking avatar video from my photo and script",
  benefits: ["Reuse your authorized portrait without filming every take", "Review your script and credit reservation before rendering", "Download private presenter videos and separate captions"],
  capabilities: ["Reusable JPG, PNG and WebP portraits with recorded adult-likeness consent", "Fabric 1.0 photo animation through fal with a configured English studio voice", "Scripts up to 28 words for 15 seconds or 62 words for 30 seconds", "480p or 720p exports in vertical or landscape format with optional burned-in captions", "Private MP4 and SRT downloads, background progress, cancellation and consent revocation"],
  limitations: ["This is photo-based animation, not a trained personal avatar, identity verification or voice cloning. Appearance and lip sync may vary.", "Only use your own adult likeness or an adult presenter who has explicitly authorized the photo and exact script. No impersonation or fabricated endorsements.", "Uploads must be 8 MB or smaller, at least 256 pixels per side and at most 20 megapixels. Use one clear, front-facing person.", "Rendering reserves 15 preparation credits plus 6 credits/second at 480p or 10 at 720p. Actual speech duration is rounded up; unused credits are returned. Failed/cancelled jobs are refunded.", "Exports include an AI presenter disclosure. Revoking consent stops new renders and removes the source portrait; existing exports and processing records require a separate deletion request.", "Live generation requires the presenter migration, deployed background worker, fal and studio-voice credentials. No automatic social publishing."],
  exampleMedia: [], relatedFeatures: ["ai-ugc-product-ads", "faceless-video-generator"], status: "published", developmentOnly: false,
  publishedAt: "2026-09-28T00:00:00.000Z", modifiedAt: "2026-09-28T00:00:00.000Z",
  seo: { title: "AI Digital-Clone Presenter — Photo to Talking Video", description: "Turn your authorized portrait and script into a talking AI presenter. Reuse portraits, add a studio voice and captions, then download private MP4 videos.", heading: "Your portrait, turned into an AI presenter video", canonicalPath: "/features/ai-digital-clone-presenter", editorialOverride: true },
}));

export function canIndexFeature(feature: FeatureDefinition) {
  return feature.status === "published" && !feature.developmentOnly;
}

featureCatalog.push(featureDefinitionSchema.parse({
  slug: "podcast-to-shorts", name: "Podcast & video to Shorts",
  description: "Turn recorded podcasts, interviews and talking videos into vertical Shorts. Find useful moments, review the cuts, follow faces near selected speaker positions and add animated captions.",
  audience: ["Podcasters", "Educators", "Interviewers", "Content teams"], searchIntent: "Turn a long podcast or talking video into captioned vertical short clips",
  benefits: ["Find useful moments without reviewing every minute manually", "Keep control of clip boundaries, captions and speaker framing", "Reuse original footage and voices in downloadable vertical videos"],
  capabilities: ["Private resumable MP4, MOV and WebM uploads up to 200 MB, 1080p and 30 minutes", "Whisper transcription with word timestamps and speaker labels through fal", "Gemini on fal suggests up to five self-contained highlights", "Editable 15–60 second cuts, titles and caption-word corrections", "Assisted face-follow with voice-to-position mapping, manual crop or full-frame fit", "Animated word-highlight or clean captions, 720 × 1280 MP4 and separate SRT exports", "Saved projects, selected-clip rendering, background jobs and cancellation"],
  limitations: ["Requires a video recording with spoken audio, 30 seconds to 30 minutes long. Audio-only podcasts and link imports are not supported in this release.", "Face-follow uses detected faces near your chosen anchor. It is not guaranteed active-speaker recognition: match voices to positions for multi-person recordings and review camera changes.", "Transcripts and suggested moments need human review. Caption corrections do not alter the original spoken audio. No promised views, virality or search position.", "Analysis costs 40 credits; export costs 10 credits per selected clip. Completed analysis remains charged when you choose not to export. Re-rendering costs credits again.", "Live processing requires the Shorts migration, deployed worker with OpenCV/FFmpeg, fal access and account credits. No automatic social publishing or scheduling."],
  exampleMedia: [], relatedFeatures: ["faceless-video-generator", "ai-ugc-product-ads"], status: "published", developmentOnly: false,
  publishedAt: "2026-09-25T00:00:00.000Z", modifiedAt: "2026-09-25T00:00:00.000Z",
  seo: { title: "Podcast to Shorts — AI Video Clipper & Captions", description: "Turn podcast recordings into vertical Shorts. Find highlights, edit cuts, adjust speaker framing and add animated captions. Review and export with ETA.", heading: "Turn your podcast or long video into ready-to-post Shorts", canonicalPath: "/features/podcast-to-shorts", editorialOverride: true },
}));
