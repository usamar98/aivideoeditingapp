# Ad Remake rollout

Routes: `/studio/ad-remake` and `/studio/ad-remake/[id]`. Local, no-charge preview: `/studio/ad-remake?preview=1`.

Apply `supabase/migrations/20261009102609_ad_remake_studio.sql` after the existing real-estate migration. It adds one owner-isolated table, service-only job/billing RPCs and restrictive private-media policies. It does not alter plan prices, balances or existing projects. Deploy the web app and Trigger worker (`ad-remake-pipeline`) together. Production migration and deployment are not performed by the local implementation.

No new API keys. Reuse configured `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TRIGGER_SECRET_KEY` and worker `FAL_KEY`. FFmpeg/FFprobe and fonts are already installed by `trigger.config.ts`. Optional local `FFMPEG_PATH` / `FFPROBE_PATH` overrides remain supported.

The reference-editing endpoints are `fal-ai/kling-video/o3/standard/video-to-video/edit` and `fal-ai/kling-video/o3/pro/video-to-video/edit`. Enable provider access/funding before testing real renders. Official contracts: https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit/api and https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api .

Supported inputs: authorized 3–15-second MP4/MOV, max 100 MB, 720–3840 px per side; 1–4 views of one product (PNG/JPEG/WebP, max 8 MB each, min 100 px per side, max 20 MP). Worker probes every source before paid inference, strips metadata, normalizes images and snapshots private asset paths. Browser cannot mutate saved briefs or replace protected source objects.

Saving a brief is free. Rendering reserves Standard 6 or Pro 8 credits per second, with duration rounded up. Reconnecting uses the saved generation ID and durable fal request ID. Completed output charges once; failed/cancelled output returns reserved credits. Cancellation must stop the worker before settlement. Existing job cancellation still forwards to the prior implementations.

Exports preserve aspect ratio, cap the longest side at 1920 px, add a visible AI-edited disclosure and optionally overlay exact CTA text in the last two seconds. Audio defaults off; retention uses the authorized original audio. No new voiceover, scraping, automatic posting, impersonation or fabricated endorsements. Product fidelity and model-generated text require human review. Do not advertise guaranteed conversion performance.

Verification must not use real paid inference or publish advertisements without explicit authorization. For a production smoke test, use your own 5-second clip and product image, approve the displayed cost, inspect private output and confirm exactly one reservation/settlement. Also test cancellation before and after worker claim.
