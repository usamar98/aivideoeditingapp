# Marketing media

Updated: 2026-09-26.

## Presentation and provenance

The homepage hero, homepage feature cards, studio tool cards, and shared UGC preview use AI-generated inspiration. These are **not ETA exports, customer work, testimonials, or guarantees of output quality**. Concept labels and the hero credit are intentionally visible. The fictional presenter is not a real endorser; products are unbranded.

All media is served locally from `public/examples/`. No external media embeds, trackers, provider keys, database migrations, or paid API calls are needed for this change. Do not add these example assets to paid downloadable outputs or represent them as a user's generated work.

## Original image assets

Generated with the built-in image-generation tool (three independent new-image calls; no reference images). The original PNGs remain in the local generated-images folder. Production copies were resized to 1600 × 900 and encoded as quality-84 WebP with Sharp; the subjects were not edited.

| Asset | Use | Approximate size |
| --- | --- | --- |
| `public/examples/faceless-space.webp` | Faceless / cinematic inspiration | 192 KB |
| `public/examples/cartoon-forest.webp` | Cartoon / character inspiration | 259 KB |
| `public/examples/presenter-product.webp` | Fictional presenter and product-ad concept | 98 KB |

### Generation prompts

#### faceless

Use case: stylized-concept. Asset type: cinematic AI-generated visual example for an AI video creation website, landscape 16:9 image. Primary request: a breathtaking cinematic scene of a lone astronaut standing on pale rippling dunes under an enormous luminous blue planet and delicate star field, distant blue mountain ridges, golden-hour cream highlights, deep cobalt and electric blue atmosphere. Photorealistic science-fiction film still with remarkable scale, fine sand texture, realistic spacesuit, restrained cinematic grain. Wide composition, central subject safe for landscape and square cropping. No text, no logos, no watermarks, no user interface, no frames. Original fictional scene, not a real photograph.

#### cartoon

Use case: illustration-story. Asset type: premium AI-generated animated-story visual example for a video creation website, landscape 16:9 image. Primary request: an original charming little orange fox explorer wearing a cobalt-blue scarf and cream satchel, beside a tiny friendly round ivory robot with blue eyes, discovering an enormous glowing blue butterfly in a lush magical forest clearing. Premium cinematic 3D animated-film still, tactile fur, soft hand-crafted materials, expressive faces, beautiful blue-green foliage and warm golden rim light, enchanting depth of field. Characters centered and fully readable in a wide card crop. No text, no logos, no watermark, no interface, no frames, no known franchise characters.

#### ugc

Use case: ads-marketing. Asset type: AI-generated product-ad concept image for a video creation website, landscape 16:9. Primary request: polished editorial split-scene composition: on the left a fictional adult female AI presenter about 28, friendly natural expression, shoulder-length brown hair, cobalt blue casual shirt, chest-up in a softly lit warm cream home studio; on the right a large unbranded cobalt-blue skincare pump bottle with a cream label on a travertine pedestal, small blue serum vial alongside it and soft botanical shadow. An elegant thin cream gutter separates portrait and product photograph, like a real presenter-led product-ad layout, not a floating UI card. Photorealistic generated person with natural skin texture, high-end beauty campaign lighting. Product stays separate from the presenter; she is not holding it or endorsing it. No lettering, no real brands, no logos, no captions, no watermark. Central important details with space along bottom for website disclosure overlay.



## Stock AI video and poster

- Title: Fantasy, nature, dream.
- Creator: michellemorseu, via Pixabay.
- Source: https://pixabay.com/videos/fantasy-nature-dream-ai-generated-203486/
- License: Pixabay Content License (not CC0), reviewed 2026-09-25: https://pixabay.com/service/license-summary/ and https://pixabay.com/service/terms/ (sections 5–6).
- The source page explicitly labels the clip **AI generated**. It does not identify a model; do not invent one.
- Published by source: March 10, 2024.
- Video URL: https://cdn.pixabay.com/video/2024/03/09/203486-921629628_large.mp4
- Source preview URL: https://cdn.pixabay.com/video/2024/03/09/203486-921629628_tiny.jpg (replaced locally with a sharper frame extracted from the video).
- Local files: `public/examples/fantasy-forest.mp4` (1,085,854 bytes), `public/examples/fantasy-forest.webm` (approximately 306 KB), and `public/examples/fantasy-forest-poster.jpg` (1280 × 720).
- Video: original 1920 × 1080 H.264 MP4, approximately 6.13 seconds, silent (no audio track). Also encoded as 1280 × 720 VP9 WebM (CRF 33), offered first for broader embedded-browser compatibility. Poster extracted at 0.3 seconds. No narrative/content edits to the stock footage. Integrated into the designed hero with original concept images, captions and website copy; not offered as standalone stock for resale/download.
- The license permits free commercial use and adaptation, subject to restrictions on standalone distribution, misleading attribution/endorsement, trademarks, and other third-party rights. The fictional forest clip shows no identifiable people or branding. Keep the visible source credit and the “not ETA exports” disclosure when reusing it.

## AI portrait video for the hero and coming-soon preview

- Title: AI generated, woman, beauty, portrait.
- Creator: freestock_video, via Pixabay.
- Source: https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/
- Source page explicitly identifies it as **AI generated**, published August 3, 2025. No model or real-person identity is claimed.
- License: Pixabay Content License, reviewed September 26, 2026: https://pixabay.com/service/license-summary/. Commercial adaptation is permitted subject to the license and third-party rights; this is an integrated marketing illustration, not a standalone stock offering.
- Download URL observed on the source page: https://cdn.pixabay.com/video/2025/08/01/294774_large.mp4
- The clip was capped at six seconds (approximately 5.21 seconds of available footage) and resized to 540 × 968, with audio removed, encoded as H.264 MP4 (688,566 bytes) and VP9 WebM (1,039,038 bytes). The JPEG poster is extracted at 0.3 seconds (59,718 bytes).
- Local files: `ai-portrait.mp4`, `ai-portrait.webm`, and `ai-portrait-poster.jpg` in `public/examples/`.
- Visible disclosure: **AI portrait inspiration, not an ETA clone or a speaking demo**. It is not a generated customer result, a real digital-cloning demonstration, an endorsement or a promise that the planned feature is available.
- The four social publishing cards are static, explicitly coming soon; brand icons identify planned destinations without implying affiliation or a working integration.

## Performance and accessibility

- The digital-clone preview has native, keyboard-accessible controls and opt-in playback. All videos use WebM with MP4 fallback, inline playback, local posters and fixed aspect ratios.
- The hero uses **two opposite-direction sliding rows of 9:16 reels**, mixing six unique silent clips and the three existing concept images. Each row is duplicated for a seamless CSS loop. The previous individually positioned floating phones/social icons are removed; social badges now travel with the reels. Desktop rows sit behind a cream readability veil and the headline. On narrow phones, the same two rows flow below the copy within the hero so neither the text nor media is obscured.
- **Pause motion** stops both video and CSS animation. Motion begins only after hydration when reduced-motion and Save-Data preferences allow it. One shared IntersectionObserver and visibility listener stop off-screen/hidden-page playback and pause the row animation when the hero leaves the viewport. Only intersecting clips play. The server renders static posters. `preload="none"` avoids fetching video before playback. Reduced-motion also disables CSS animation without relying on JavaScript.
- Next Image provides responsive sources and lazy loading for the concept artwork. Hero image sizing accounts for the wider source needed when covering a 9:16 frame with 16:9 artwork, keeping cropped portraits sharp. Decorative hero media is hidden from assistive technology, with descriptive text and disclosures in the hero. The studio's first above-the-fold image loads eagerly.
- Asset/link/provenance regression checks live in `tests/marketing-media.test.ts`.

## New free AI stock for the two-row hero (2026-09-26)

These are free-to-use stock assets under the **Pixabay Content License**, not public-domain/CC0 assets. License reviewed at https://pixabay.com/service/license-summary/. Commercial integration/adaptation is permitted subject to the license restrictions; no standalone stock downloads, endorsement claims, or resale are offered. Source pages identify the clips as AI-generated (the beauty clip uses the source's AI-generated tag). Models are not identified, so no model attribution is invented.

| Local basename | Source / creator | Original format |
| --- | --- | --- |
| `hero-cartoon` | [Cartoon sloth — Zeprexa](https://pixabay.com/videos/ai-generated-sloth-lazy-funny-cute-230932/) | 1080 × 1920, 24 fps |
| `hero-space` | [Space / galaxy — FREE24h](https://pixabay.com/videos/ai-generated-space-universe-galaxy-204371/) | 1080 × 1920, 30 fps |
| `hero-anime` | [Anime girl in the rain — kalsstockmedia](https://pixabay.com/videos/ai-generated-girl-cartoon-character-264168/) | 1080 × 1920, 30 fps |
| `hero-ugc` | [Beauty-ad concept — Mangkubil](https://pixabay.com/videos/beauty-beauty-product-cosmetics-339378/) | 3840 × 2160, 60 fps |

Observed source downloads:

- https://cdn.pixabay.com/video/2024/09/11/230932_large.mp4
- https://cdn.pixabay.com/video/2024/03/16/204371-924209277_large.mp4
- https://cdn.pixabay.com/video/2025/03/12/264168_large.mp4
- https://cdn.pixabay.com/video/2026/03/10/339378_large.mp4

Adaptations: first six seconds, cover-scaled and center-cropped to **360 × 640**, square pixels, 24 fps, audio removed. H.264 MP4 (CRF 27 / fast-start) plus VP9 WebM (CRF 36); JPEG poster extracted at 0.3 seconds. Each new video rendition is under 200 KB and each poster under 60 KB. Raw downloads stay in ignored `.seo-cache/`, not in Git. Existing forest and portrait files remain unchanged and are reused in the rows.

The beauty close-up is labeled **AI ad inspiration**, not a real UGC testimonial. The original fictional presenter/product artwork supplies the UGC and product concepts. No clearly licensed actual digital-clone demo was selected: the existing AI portrait stands in as explicitly labeled inspiration with **Digital clone · Soon**. The coming-soon feature card retains its own opt-in preview and disclosure. The hero's expandable **Media credits · Pixabay** lists every stock creator/source and the license; the "not ETA exports" notice stays visible when credits are collapsed.
