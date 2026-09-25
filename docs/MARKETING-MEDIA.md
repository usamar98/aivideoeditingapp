# Marketing media

Updated: 2026-09-25.

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

## Performance and accessibility

- Native video controls, keyboard-accessible playback, inline playback, WebM with MP4 fallback, matching local poster, fixed aspect ratio, and a text description of the silent clip.
- Playback is opt-in: no autoplay or looping, so reduced-motion visitors are not forced into movement. `preload="none"` avoids downloading the MP4 before playback.
- Next Image provides responsive sources, meaningful alt text, and lazy loading for the concept artwork. The studio's first above-the-fold image loads eagerly.
- Asset/link/provenance regression checks live in `tests/marketing-media.test.ts`.
