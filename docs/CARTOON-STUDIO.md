# Prompt-to-cartoon studio

The real creation flow is `/studio/cartoons`. `/studio/cartoons?preview=1` and
`/studio/cartoons/demo` are explicitly labelled, non-billable public previews.
The older Pip and Moss editor remains a separate sample; it is no longer the main CTA.

## Release steps

1. Apply `supabase/migrations/20260924135448_cartoon_studio.sql` after the three existing migrations. It adds private projects and service-only job transactions, and extends cancellation without changing balances or old jobs.
2. Deploy Trigger (`npx trigger.dev@4.6.4 deploy`) and verify `cartoon-pipeline` exists in Production. It uses Node 22, a 4 GB machine, capped FFmpeg threads and streamed media. Cartoons need `FAL_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Trigger Production. Keep `GEMINI_API_KEY` for the separate faceless/legacy script features; cartoons no longer use it.
3. Deploy the Next.js changes. Vercel needs the existing Supabase keys and Production `TRIGGER_SECRET_KEY`. No new OpenAI or ElevenLabs key is needed for cartoons.
4. Optional: set `CARTOON_SEEDANCE_ENABLED=true` on Vercel only after verifying your fal account's Seedance 2.5 access, then redeploy. Otherwise the selector explains why that model is disabled. There is no silent model fallback or unexpected extra charge.
5. Sign in, upload a PNG/JPG/WebP (up to 8 MB; up to three named characters), save a prompt, approve cast generation, review/edit scenes, then approve animation. Test cancellation and downloads with your own account before launch.

## Models researched September 24, 2026

These are quality-oriented selections from fal's current catalog, not a claim that one model wins every benchmark.

- Character design and reference editing: `openai/gpt-image-2.5/sunburst/text-to-image` and `/edit`, high quality, one image per request. [API](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api).
- Default animation: `fal-ai/kling-video/o3/pro/reference-to-video`, character elements, first-frame conditioning, native audio. [API](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api). Listed cost with audio: $0.14/second at research time.
- Optional premium animation: `bytedance/seedance-2.5/reference-to-video`, 720p, H.264, native audio, explicit image references and `end_user_id`. [API](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api). Token-based pricing is higher and depends on output dimensions/duration.
- Story planner: `google/gemini-3.8-flash` through fal's `openrouter/router/openai/v1/chat/completions`. Gemini 3.8 Flash is the newest general-purpose text/vision Gemini model listed in the checked catalog (released September 2, 2026). It reads the prompt and uploaded images and returns schema-validated cast/scene/dialogue JSON. Planning and media generation use fal billing. [fal API](https://fal.ai/models/openrouter/router/openai/v1/chat/completions/api) · [Model catalog](https://openrouter.ai/google/gemini-3.8-flash).

One character portrait per cast member is saved privately and reused for scene-frame edits and video references. Films use 3 scenes for 15/30s and 6 scenes for 60s. Scene dialogue is capped at two words per second. Frames are generated at animation time; the review step shows character portraits and a text storyboard, not pre-rendered scene previews. Animation audio is preserved when clips are normalized and concatenated.

## Credits and limitations

Cast + story: 40 credits. Animation: Kling 8 credits/second (120/240/480); Seedance 24 credits/second (360/720/1440). These application prices are visible before each stage and mirrored in SQL, with parity tests. They are not dollar quotes from fal. Review margins as provider pricing changes. A successful plan stays charged if animation is later cancelled; failed/cancelled stages refund their reservations exactly once. Re-rendering a completed film is a new paid job.

English speech only in this UI. Exact dialogue, lip sync and cross-scene voice/appearance consistency are not guaranteed. No voice cloning, 3D rigs, automatic subtitles, cross-project character library or individual scene regeneration. Review uploaded-image rights and generated media before publishing.

## Reliability and security

- Owner-authenticated actions, RLS reads, private uploads, signed previews, immutable cast during story edits, server-owned pricing and atomic reservation/settlement.
- Generated cartoon assets/checkpoints are read-only to browsers; restrictive Storage policies reserve writes in the `cartoons/` namespace for the service-role worker. Ordinary reference uploads remain user-writable.
- Cartoon and existing video jobs share the two-active-job workspace limit.
- Every worker must claim its generation and check cancellation before paid calls/publication. Late workers cannot resurrect cancelled generations.
- fal request IDs and responses are saved per stage. Submission transport retries are disabled. An intent without a saved request ID is treated as uncertain and fails closed instead of submitting twice. Support should inspect the provider dashboard before allowing a new paid attempt. Provider inference already started may not be cancellable, even though the app stops publishing its output and returns app credits.
- Private artifacts survive worker retries; media downloads are size-bounded, restricted to fal hosts, and written to per-run temporary directories. No unbounded video buffers.
- `cartoon-smoke-check` is an owner-approved one-use diagnostic. Its fixed storage lock prevents repeated billing; it uses no app-user credits and does not create subscriptions. It must not be exposed through any user-facing endpoint.

## Checks

`npm run check` includes model-contract, durable-submission and real Postgres migration/RLS/credit/cancellation tests. Provider smoke tests are separate paid actions and require approval; passing unit tests alone does not verify fal account/model availability or production database deployment.

### Verification record — September 24, 2026

- `npm run check`: type checking, lint, **196 tests across 24 files**, and the Next.js production build passed.
- Desktop and 390px mobile previews were checked for creator controls, story/dialogue editing, scene reordering, and horizontal overflow. No browser console errors were observed.
- With explicit owner approval for one test capped at US$5, Trigger Production deployment `20260924.4` (`d494eni5`) ran `cartoon-smoke-check`, run `run_06gd7ljnd4n2d71ml16mbvp601`, successfully. It made three fal submissions: one character portrait, one reference-based scene edit, and one 5-second Kling O3 Pro native-audio clip. There were no app-user credit or subscription changes.
- The worker verified a 5.000-second, 1280×720 H.264 MP4 with AAC audio on Node 22.16.0. Its visual output was also inspected in the browser. Private artifacts are under `diagnostics/cartoon-smoke-20260924-v1/`; the one-use budget lock must remain in place.
- This test took about 13 minutes including provider queue/generation time. It verifies the fal image/video chain, storage and FFmpeg, not instant generation or exact spoken dialogue. Actual billed dollars have not been independently reconciled against fal's billing ledger.
- At the time of this initial smoke test, the SQL migration and website changes were not yet applied/published. The website code was subsequently pushed in `a04ca7c`. The authenticated end-to-end multi-scene flow still needs an account acceptance test. Seedance 2.5 was not part of this paid test and remains opt-in.

### Previous Gemini direct-API transport fix (superseded by fal below)

This is the historical verification record for the Google-direct implementation. The current cartoon planner uses the fal migration described in the next section.

Production run `run_06gd82vrbotsg4rnv4avpbac01` failed twice inside `@google/genai`'s Interactions HTTP client with `TypeError: unusable`. The trace does not establish that AbortSignal garbage collection caused it. The SDK clones a Request for transport/retries; the fix removes that path for cartoons without changing the model or prompting contract.

- The cartoon planner now uses a single native fetch to Google's documented [Interactions REST API](https://ai.google.dev/api/interactions-api), with the same `gemini-3.8-flash`, JSON schema, image inputs and `store: false`.
- A scoped AbortController holds its parent listener and deadline until the response body is consumed, then removes both. The same lifecycle is used for cartoon reference downloads and fal submit/status/result requests; it is disposed before durable waits.
- `planner-intent.json` is persisted before the paid POST; `planner-response.json` is persisted before validation and retains usage metadata. Existing SDK-written checkpoints remain readable. An uncertain submission is never automatically sent again. Planner transport errors stop the task without automatic retry; normal failure settlement returns reserved app credits.
- Trigger logs report generation ID, model, failure category, HTTP status and allowlisted network cause codes. They never include raw error bodies, keys, private prompts or images. Check HTTP 401/403 for credentials/access, 404 for model/endpoint access, 429 for provider quota, and 5xx for provider availability.
- Offline tests force the reported Request-cloning error, check the new path, cancellation/deadlines, HTTP failures, response parsing, redaction, and checkpoint recovery. This does not prove the original production request's exact underlying cause or substitute for a live Gemini acceptance test. No paid generation is automatically run or replayed during deployment.
- Worker-only patch: no new environment variables, SQL migration, pricing changes or Vercel redeploy are required for this transport change.
- Verification: `npm run check` passed type checking, lint, **224 tests across 25 files**, and the Next.js production build. These checks use mocked planner/provider requests; no additional paid generation was run.
- Deployed directly from the local working tree to Trigger Production as **20260924.6** ([deployment `3jvxjhpv`](https://cloud.trigger.dev/projects/v3/proj_buramjqzkflsxgozeeew/deployments/3jvxjhpv)); confirmed as the current worker with `cartoon-pipeline` and all seven tasks registered. Node 22 build completed successfully. This worker deployment preceded the corresponding GitHub commit.

### Gemini planner migration to fal

Two subsequent jobs on worker `20260924.7` reached the Google API but received HTTP 503. At the owner's request, new cartoon plans now use Gemini through fal instead of the direct Google Interactions API. This is a provider-route change, not a guarantee against upstream model outages.

- The only planner credential is the existing server-side `FAL_KEY`. No separate Google, OpenRouter or OpenAI key is used for cartoons. Other features still using Google directly are unchanged; do not remove their `GEMINI_API_KEY`.
- The allowlisted fal endpoint forwards OpenAI-compatible multimodal messages to `google/gemini-3.8-flash`. Owner-checked private reference images are passed as data URIs, in reference-slot order, without making the Supabase bucket public. Both fal and its OpenRouter-backed service process the request.
- Requests use JSON-schema structured output, schema-capable provider routing, no streaming, no tools/search, and a 16,384-token output cap. There is no fallback to a different model or to the direct Google API. The application also validates the returned story and cross-field scene/cast rules. Truncated, refused, empty or invalid responses are not published.
- `planner-fal-intent.json` is saved before submission, `planner-fal-request.json` stores the endpoint/model/request ID, and `planner-fal-result.json` retains the raw response and usage before validation. Retries reuse saved IDs/results. An uncertain submission with no saved ID stops rather than buying a duplicate. Provider-side retries/failover are outside the application's exactly-once guarantees.
- Existing `planner-response.json` Google checkpoints can still be reused. An old `planner-intent.json` without a response blocks a same-job provider switch. Start a new job in the app after the old job is settled; never replay refunded or cancelled jobs from Trigger.
- fal HTTP statuses and request IDs are logged without raw provider errors, keys, prompts or reference images. Queue polling uses cancellation checkpoints and scoped deadlines; cancellation sends a best-effort fal stop request. Provider work already underway may still incur charges.
- No SQL migration, new environment variable, UI/pricing change, or dependency installation is required. Deploy the changed Trigger worker for the production website to use this route. The migration is verified with offline mocks; a real fal Gemini generation requires separate spending approval.
- Local verification: `npm run check` passed type checking, lint, **241 tests across 26 files**, and the Next.js production build. The mocked HTTP contract test verifies that planner traffic uses only `queue.fal.run` and `FAL_KEY`. The owner approved production deployment and the GitHub push; no paid generation was run.
- Production release: deployed the local working tree as **20260924.8** ([deployment `w3aw01wa`](https://cloud.trigger.dev/projects/v3/proj_buramjqzkflsxgozeeew/deployments/w3aw01wa)) and confirmed it as the current worker with all seven tasks registered, including `cartoon-pipeline`. This confirms deployment, not a live fal Gemini generation; no user job was triggered or replayed.
