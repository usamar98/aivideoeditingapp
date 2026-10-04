# Real estate video studio

Research and implementation: 4 October 2026. Route: `/studio/real-estate`. Public guide: `/features/ai-real-estate-video-generator`.

## Competitor findings

This is a workflow-based shortlist, not a paid side-by-side quality ranking. Published examples and product documentation show capabilities; they do not establish independent performance guarantees.

| Platform | Useful workflow / output pattern | Applied to ETA |
| --- | --- | --- |
| [AutoReel](https://www.autoreelapp.com/) | Real-estate-specific photo import, photo animation, editor, narration and branding; short portrait/landscape listing tours | Real uploaded photos, explicit ordering, restrained camera motion, private review and contact card |
| [Revid real estate marketing video](https://www.revid.ai/tools/real-estate-marketing-video) | Property details and photos become narrated marketing videos | User-approved room narration and a low-friction listing form |
| [Invideo real estate marketing](https://invideo.io/make/real-estate-marketing/) | Template/editing-oriented real-estate marketing videos | Reusable brand treatment and landscape/portrait export |
| [Styldod](https://www.styldod.com/real-estate-video-editing) | Human editing service, not an equivalent automated AI generator; polished property footage, pacing and branding | Editorial room sequencing and readable branding, without claiming its human-editing service exists in ETA |

Recommended output strategy: factual listing first, cinematic motion second. Animated uploaded photos cannot prove a property's layout, dimensions or condition. No model is labelled as a guaranteed architectural-preservation winner. No claims about leads, sales uplift or MLS acceptance.

## Shipped workflow

- Upload 2–12 authorized PNG/JPEG/WebP photos, up to 8 MB each. Worker checks file signatures, minimum 256px sides and maximum 20MP before any paid stage.
- Order rooms, edit labels and optional brief English narration. Choose gentle push, subtle pan or still camera.
- Select 6 or 8 seconds per room; a 4-second agent/contact card gives 16–100 seconds total.
- Faithful photo motion is deterministic and does not use a generative video model. Optional AI motion can change property details; exports carry a visible disclosure. Originals remain in the project for comparison.
- Optional ElevenLabs v3 voiceover (Rachel/Aria) through fal. No separate ElevenLabs key is required for this feature. Provider-native video audio is disabled/discarded. Speech longer than its room fails instead of being cut off.
- Private 1080p MP4 canvas in 16:9 or 9:16, aspect-preserving fit/padding; separate room-timed SRT. No burned-in captions, music, virtual staging, MLS import, interactive 3D tour or automatic social publishing.
- Immutable approved briefs, separate cost confirmation, owner-only RLS, server-owned atomic credit reservations, resumable artifacts and provider request IDs, cancellation and exactly-once settlement.

## Models and API evidence

`scripts/verify-real-estate-models.mjs --snapshot` retrieves public OpenAPI metadata only. Captured contracts are in `tests/fixtures/real-estate-fal-schemas.json`; tests validate both durations and orientations. Schema verification does not establish output quality, account entitlement or a successful paid production render.

| Model | fal endpoint | ETA credits per room-second |
| --- | --- | --- |
| Faithful photo motion | Local FFmpeg; no inference | 1 |
| Kling 3.0 Pro | `fal-ai/kling-video/v3/pro/image-to-video` | 15 |
| Kling 3.0 Standard | `fal-ai/kling-video/v3/standard/image-to-video` | 10 |
| Seedance 2.5 | `bytedance/seedance-2.5/image-to-video` | 80 |
| Veo 3.1 | `fal-ai/veo3.1/image-to-video` | 30 |
| Veo 3.1 Fast | `fal-ai/veo3.1/fast/image-to-video` | 18 |
| Wan 3.0 | `alibaba/wan-3.0/image-to-video` | 15 |
| LTX 2.3 Pro | `fal-ai/ltx-2.3/image-to-video` | 6 |
| LTX 2.3 Fast | `fal-ai/ltx-2.3/image-to-video/fast` | 5 |

Source examples: [Kling API](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api), [Seedance API](https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api), [Wan API](https://fal.ai/models/alibaba/wan-3.0/image-to-video/api), [ElevenLabs v3 API](https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3/api). Other endpoint contracts are captured directly from fal's public OpenAPI service.

Seedance's API schema lists 1080p while its product copy mentions 720p; this feature conservatively requests 720p and labels the 1080p result as an export canvas. No native-4K claim.

Charge = 10 export credits + rooms × room seconds × model rate + (5 credits per room if voiceover is on). These are product credits, not provider USD quotes. Failed or confirmed cancelled jobs settle to zero; ambiguous dispatch remains reserved until recovery or cancellation.

## Rollout (not performed by a Git push alone)

1. Apply all outstanding migrations in chronological order, including `supabase/migrations/20261004140532_real_estate_video_studio.sql`. It adds the private project table, RPCs and scoped storage policies; no existing account balances are edited.
2. Deploy the Trigger.dev production worker using the project's established deployment process. The new `real-estate-pipeline` task is exported by `src/trigger/pipelines.ts`. A Vercel Git deployment does not deploy Trigger tasks.
3. Existing Vercel configuration: Supabase public URL/publishable key, server `SUPABASE_SECRET_KEY`, and `TRIGGER_SECRET_KEY`. Existing Trigger configuration: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `FAL_KEY` for AI motion/narration. Keep secrets server-side. The existing build extension supplies FFmpeg 7 and fonts.
4. Silent faithful mode requires the database, worker and ETA credits but no fal inference credentials. Verify provider balance/access before allowing paid AI modes in production.
5. Smoke-test one authorized listing end to end, including download, job cancellation and account balance, before announcing availability. No paid provider tests were run during implementation.

## Search implementation

The shared feature catalog supplies canonical metadata, Open Graph routes, sitemap and LLM-discovery inclusion. The dedicated editorial guide explains the workflow, pricing, limitations, use cases and FAQs without invented examples or testimonials. Existing page templates emit SoftwareApplication, WebPage and BreadcrumbList structured data; there is no FAQ rich-result promise. Studio routes remain noindex. The feature is linked from the home feature grid, feature directory, studio library and sidebar, replacing the old coming-soon card.

## Verification

- Unit/API contract tests: all 8 motion models, optional TTS, limits, pricing, safe text rendering and honest SEO.
- PGlite integration tests: migration execution, owner isolation, asset ownership, all rate combinations, ordered snapshots, single reservation/settlement, cancellation and late-worker fencing.
- Worker/action tests: authentication, explicit approval, source validation before inference, faithful mode without fal, AI source binding, checkpoint resume, incomplete video rejection and narration overflow.
- Optional real encoder test: set `REAL_ESTATE_FFMPEG_TEST` to a local FFmpeg binary, then run `npm run test -- tests/real-estate-ffmpeg.test.ts`. Uses synthetic test charts, exercises both 1080p formats and verifies a 16-second MP4 with stereo AAC. Windows uses a local font substitution for this test; the production worker uses DejaVu Sans.
- Browser checks: desktop/mobile layout, sample-photo preview upload, engine/price update, photo ordering, no runtime errors. Preview mode never uploads to storage or charges an account.

No cross-model paid quality benchmark or authenticated production render has been performed. The untracked `output/` and `tmp/` folders are excluded from the commit.
