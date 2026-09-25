# AI UGC & product ads

Implemented locally on September 25, 2026. This document does not certify a production deployment or a paid end-to-end provider run.

## Research and product decisions

Reviewed primary product examples before implementation:

- [Arcads](https://www.arcads.ai/): actor-led ads, product presentation and creative controls. ETA adopts presenter choice and editable messaging, not its customer testimonials, results or actor library claims.
- [HeyGen video ad creator](https://www.heygen.com/tool/video-ad-creator): product links/photos, scripts, avatars, captions and variant testing. ETA separates fact review, planning and paid rendering.
- [Creatify Boreal on fal](https://fal.ai/models/creatify/boreal/api): product/presenter video with native or supplied audio. Considered as a future full-scene option; not silently used as a fallback.
- [Kling AI Avatar v2 Pro on fal](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro/api): verified image_url + audio_url + optional prompt contract. Chosen for audio-driven presenter animation and predictable scripted narration, not because of an unsupported “best model” ranking.

ETA retains original product photos in a composition alongside the presenter. It does **not** promise generated product handling, unboxing or exact AI-recreated packaging. Three different hooks share the body, CTA and presenter. Exported videos visibly disclose “AI presenter”.

## Workflow and costs

1. `/studio/ugc`: import a public HTTPS product page or upload 1–4 product photos; review product facts, benefits, audience, offer and CTA. Saving costs nothing.
2. Confirm **20 credits** for an ad plan (three hooks plus shared copy) and a fictional AI-presenter portrait.
3. Review presenter and scripts. Edit and save; explicitly approve claims. Choose 1–3 hooks.
4. Render **120 credits per 15-second variant** or **240 per 30-second variant**. The database computes the cost; the client cannot provide a price. A new plan plus three 15-second variants totals **380 credits**.
5. Download private MP4s and SRT subtitle files. Existing exports retain the script they were created with; later edits require a new render. The latest successful export for each hook appears in the project. Artifacts from prior jobs remain in private storage.

Formats: 720×1280 (9:16), 720×720 (1:1), 1280×720 (16:9). English, one configured studio voice. Optional burned-in captions; timed SRT is always produced. Actual TTS duration is checked before paid avatar animation; excessively long speech fails with a refund instead of clipping words.

Provider stack: existing Gemini-through-fal planner; GPT Image 2.5 Sunburst portrait; ElevenLabs timestamped TTS; Kling AI Avatar v2 Pro on fal; bounded-thread FFmpeg composition. Provider responses, submission intent and request IDs are checkpointed. Ambiguous paid submissions are not blindly repeated.

## Deployment order (requires owner approval)

1. Apply `supabase/migrations/20260925120544_ugc_product_ads.sql` after the existing migrations. It is additive and does not reset balances or existing projects. Supabase SQL Editor can run the file once; do not rerun it manually after it has already been applied.
2. Deploy the Trigger worker from this code: `npx trigger.dev@4.6.4 deploy`. Confirm `ugc-pipeline` is registered in the same **Production** project/environment used by the website. Node 22, medium-2x, FFmpeg 7 and DejaVu fonts are configured.
3. Deploy the website. Do not publish its feature page ahead of the migration and worker.
4. Run a separately approved, capped provider test before announcing production availability. Local tests do not prove provider balance, model access, voice permissions or current production configuration.

### Environment

No new provider account or subscription price IDs are required.

- Vercel: existing Supabase URL/publishable/secret keys and production `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `NEXT_PUBLIC_SITE_URL=https://www.editingapp.live`, `NEXT_PUBLIC_DEMO_MODE=false`.
- Trigger **Production**: `FAL_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Vercel variables do not necessarily appear in Trigger automatically; verify the worker environment.
- No direct Google Gemini key is required by this UGC worker. Never prefix secrets with `NEXT_PUBLIC_`.

### Security and operations

Projects are owner-readable with RLS and server-only writes. Uploaded product inputs and worker artifacts cannot be overwritten by a browser. Worker image signatures and dimensions are checked before FFmpeg. Importing uses validated, pinned public DNS addresses, HTTPS-only connections, no credentials or cookies, revalidated redirects, bounded bodies and timeouts; no page JavaScript is executed. Public imports are rate-limited to 30 attempts per account/day. Protected pages need manual inputs.

Shared Jobs supports UGC planning and rendering, reconnection, cancellation and project links. A queued job that never started can release its slot immediately. Running jobs require worker termination confirmation. Cancellation is monotonic, late results cannot publish, and settlement is idempotent. Partial outputs from a failed/cancelled batch are not published; the job reservation is refunded. A successful earlier plan remains charged. Prior successful exports are preserved.

Clean `ugc_import_attempts` older than 30 days as routine maintenance if desired. Do not delete private generation checkpoints while jobs are active or retries/recovery may become unsafe.

## SEO and AI discovery

Public feature URL: `https://www.editingapp.live/features/ai-ugc-product-ads`.

The feature is in the typed publication catalog, public homepage/features links, sitemap and `llms.txt`. It gets canonical, Open Graph/Twitter metadata, a generated social image, WebPage/SoftwareApplication/BreadcrumbList JSON-LD, process guidance, use cases and visible question-and-answer content. Private studio/API routes remain noindex and absent from sitemaps. There are no fake reviews, fabricated VideoObject examples, ranking promises or guaranteed ad-performance claims.

After production deployment, inspect the feature URL in Search Console and resubmit the existing `https://www.editingapp.live/sitemap.xml` if needed. URL inspection is for the public feature page, not private projects. SEO makes the content discoverable; it cannot guarantee top ranking or AI citations.

## Local verification

`npm run check` runs typechecking, lint, unit/security tests, real local Postgres migration/credit tests, and the production build. `node scripts/check-seo.mjs http://localhost:3002 --production` verifies public metadata, sitemap and private exclusions against a production-mode local server. `/studio/ugc/demo` is explicitly a no-charge illustrative editor, not evidence of a generated video.

Verified locally on September 25, 2026:

- 429 tests across 32 files pass, including product-import DNS pinning/redirect/body-size tests, action authorization and idempotency, and Postgres RLS/credit/cancellation tests.
- TypeScript, ESLint and the production build pass.
- Production-mode HTTP SEO checks pass for all 10 public sitemap pages, four social images, `robots.txt`, `llms.txt`, and private/auth/API noindex headers.
- The actual FFmpeg composition was run offline for all three aspect ratios using synthetic media: each produced a 15-second H.264/AAC MP4 with four product photos, captions, CTA and AI disclosure. Reproduce with `node --experimental-strip-types scripts/test-ugc-render.mjs <ffmpeg-path> <ffprobe-path>`; executable paths are local, not new application environment variables.
- Browser checks covered the new homepage entry, mobile public feature page, creator, hook selection and credit totals. The demo does not permit paid actions. Browser console checks found no errors or framework overlay.

Not yet verified: a paid live fal/ElevenLabs end-to-end UGC generation, production migration, production worker deployment, and production website deployment. Those require owner approval and server credentials; nothing in this task changes a live user's balance or subscription.
