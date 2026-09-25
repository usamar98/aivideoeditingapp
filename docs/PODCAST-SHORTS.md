# Podcast/video → Shorts (without Klap)

Implemented locally on September 25, 2026. This is a new workflow; it does not replace the cartoon, faceless or UGC workers. No Klap account or key is used.

## What ships

- `/studio/shorts`: authenticated project library and private, chunked video uploads.
- `/studio/shorts/[id]`: analyze, review and correct captions, change cut boundaries, select framing, match voices to screen positions, and export selected clips.
- `/studio/shorts/demo`: explicitly labelled interactive sample; no paid requests.
- `/features/podcast-to-shorts`: public product guide with unique metadata, canonical, social image, SoftwareApplication/breadcrumb structured data, limitations, FAQs and related links. The shared publication catalog includes it in the sitemap and `llms.txt`; private projects remain noindex.
- Jobs integration: progress, reconnection, cancellation, credit reservations and idempotent refunds.

### Supported input and output

Upload an MP4, MOV or WebM video with spoken audio: **30 seconds–30 minutes**, **up to 200 MB**, and **up to 1080p** (maximum side 1920 pixels). The worker validates the actual media before a paid provider call. MP4 H.264/AAC is recommended for source playback in browsers; other supported containers/codecs may render on the worker without playing in every browser.

Analysis suggests up to five useful, self-contained moments. Each edited clip must be 15–60 seconds. Exports are 720 × 1280 H.264/AAC MP4s plus SRT files. Caption corrections affect displayed text, not the original speech. Modes: animated word highlight, clean captions, or no burned-in captions. Completed analysis costs **40 app credits**; export costs **10 app credits per selected clip**, including rerenders. These are application prices, not statements about provider pricing.

No audio-only sources, YouTube/link importing, silent-video understanding, social posting/scheduling, synthetic voices, or guaranteed virality in this release.

## Providers and framing

1. FFmpeg extracts bounded mono audio from the private recording.
2. [`fal-ai/whisper`](https://fal.ai/models/fal-ai/whisper/api) produces word timestamps and speaker labels (`chunk_level: word`, `diarize: true`). Diarization has an additional provider cost.
3. The existing fal router calls `google/gemini-3.8-flash` for highlight selection. Its JSON references actual transcript word indices; invalid boundaries are rejected.
4. FFmpeg cuts the original video. OpenCV samples faces at 5 FPS locally, and FFmpeg applies smoothed crop commands and ASS captions. No recorded face images are sent to a face-identification provider.

**Face-follow is assisted, not automatic active-speaker recognition.** Voice labels do not identify faces. For multi-person shots, the user listens to each label and maps a horizontal position. The renderer follows a face near that position, with the crop anchor as fallback. Profiles, overlapping speakers, occlusion and camera/layout changes need review. Use manual crop or full-frame fit with a blurred background when appropriate. The offline frontal-face detector does not identify people or persist face identity embeddings.

The repeated upload → AI shortlist → editable clips → captioned exports pattern was informed by the public workflows of [OpusClip](https://www.opus.pro/) and [Vizard](https://vizard.ai/). Their broader marketing claims, usage figures and proprietary tracking quality are not claimed for ETA. ETA's implementation uses its own existing fal/Trigger pipeline, not either vendor's API.

## Required rollout — not applied by the local implementation

1. Back up the database and apply pending migrations in filename order, skipping already applied files. The new file is **`supabase/migrations/20260925165638_podcast_shorts.sql`**. It depends on the existing base, faceless, jobs, cartoon and UGC migrations. It creates the owner-only table and service-only credit RPCs, extends cancellation, protects input/output storage paths, and adds allowed upload/caption MIME types. It does not change existing balances or subscriptions.
2. Confirm the Supabase project's global Storage upload limit permits your desired file size. The app caps files at 200 MB, but a lower project/plan limit still applies. Signed resumable uploads follow [Supabase's TUS guidance](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), with 6 MB chunks and no overwrite.
3. Deploy the Trigger worker with `npx trigger.dev@4.6.4 deploy`. The updated config installs FFmpeg, `python3-opencv`, `opencv-data` and caption fonts, and bundles `trigger/shorts-faces.py`. Confirm **`shorts-pipeline`** appears in **Production → Tasks** before publishing the website. Node 22 is already selected. The task uses `medium-2x`, a two-run queue limit and a 90-minute timeout; compute is billed by Trigger.
4. Deploy the website to Vercel. Use the existing **production** Trigger key. A `tr_dev_` key only works with a connected local development worker; it is not a production fallback.
5. Test one recording you have permission to process: upload → analyze → edit → export → playback/download. Check the Jobs view, cancellation, credits, voice mapping and caption accuracy. A real paid end-to-end provider test still requires approval and a spending cap; none was run during this implementation.
6. Inspect `https://www.editingapp.live/features/podcast-to-shorts` in Google Search Console after deploying. It enters the existing `https://www.editingapp.live/sitemap.xml`; do not submit private studio URLs. Metadata/structured data do not guarantee rankings or AI citations.

### Environment variables

**No new API key is needed.** Keep existing variables in their correct environments:

| Environment | Existing values used |
| --- | --- |
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY`, production `TRIGGER_SECRET_KEY`, normal site configuration |
| Trigger production | `FAL_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` |

For **local worker development only**, install Python with OpenCV, FFmpeg and FFprobe. Optional executable overrides are `PYTHON_PATH`, `FFMPEG_PATH` and `FFPROBE_PATH`. Production binaries are installed by the Trigger build extensions; do not point production at Windows paths. Never expose provider or Supabase secret keys with `NEXT_PUBLIC_`.

## Safety and recovery

Uploads go directly to private storage rather than through Vercel's request body. Ownership and uploaded size are checked before project creation. The worker streams bounded files to a task-owned temporary directory, forces MP4/MOV or WebM demuxers, disables network protocols in FFmpeg, limits process threads/time, and removes its temporary files. Saved caption text cannot inject ASS formatting commands.

The server authenticates every action. Clients cannot mutate projects or call credit RPCs directly. Row locks bind reservations to an owned project and its saved revision. Repeat requests reconnect to the same job; they do not reserve twice. The database checks the shared two-job workspace limit. Previously exported clips remain available if a new job fails or is cancelled. Successful selected clips publish together; partial attempts are not presented as completed jobs.

Before every processing stage, the worker checks the database cancellation flag. Unstarted jobs can be fenced and refunded immediately. Attempted jobs release their reservation after the worker stops. Provider requests already executing may not stop instantly. Provider request IDs and completed-stage artifacts are persisted to avoid duplicate paid submissions after retry. Ambiguous provider submission is not blindly retried.

No automatic deletion schedule is invented: source media, transcripts and outputs remain private project data. Account/content deletion requests follow the existing support process. A cancelled in-flight upload may leave an incomplete upload or asset record; storage operators should use their normal retention/cleanup policy.

## Verification

Local checks on September 25, 2026: **493 tests passed** across 37 files; TypeScript, ESLint and the Next.js production build passed. Read-only HTTP SEO checks passed for 13 public pages, 13 sitemap URLs and five social images. The sample editor was exercised for invalid/valid cuts, caption corrections, selection pricing and responsive layout. This preview intentionally disables uploads and paid calls.

The real offline render check passed for face-follow/highlight, manual/clean and fit/no-caption outputs (720 × 1280 H.264/AAC, 15 seconds). Trigger's deployment **dry run** bundled the worker and Python detector successfully; it did not deploy a container or run a task. No production database migration, website deployment, worker deployment, balance change or paid API test was performed.

`npm run test` includes transcript validation, cuts/corrections, caption escaping, framing commands, authenticated actions, Trigger dispatch identity, cancellation races, database RLS, storage ownership, stale revisions, selected-clip pricing, and exactly-once settlement. The SQL migration is executed against a local PGlite test database; no production schema or credits are touched.

The actual renderer can be tested without providers:

```bash
node --experimental-strip-types scripts/test-shorts-render.mjs <ffmpeg-path> <ffprobe-path> <python-path>
```

This uses an existing AI-generated public illustration and synthetic audio. It runs the real OpenCV detector, ASS captions, and all three FFmpeg framing modes, then validates duration, dimensions and codecs. It is **not** evidence of accuracy on real multi-speaker recordings. Provider access, source-specific quality, live resumable upload behavior, and production container installation still need the release test above.
