# Short Film: research, architecture and rollout

Research date: 2026-10-03. This is an implementation brief, not a quality leaderboard.

## Relevant competitors

| Benchmark | Verified product direction | ETA design decision |
| --- | --- | --- |
| [LTX Studio](https://ltx.io/studio) | Story development, storyboards and reusable visual elements | Plan a complete miniature story and lock a reference cast before rendering. |
| [Higgsfield Cinema Studio](https://higgsfield.ai/cinema-studio) | Dedicated cinematic creation workspace | Put shot direction and model choice in the production workflow instead of a generic chat box. |
| [Runway](https://runway.com/product) | Generative visual production tools | Keep human review and downloadable output central. Do not promise unattended professional results. |

These are the most relevant workflow benchmarks for this feature, not an objective ranking of all competitors. No competitor layout, artwork, branding or marketing copy is copied.

## fal catalog verification

`src/lib/films/models.ts` contains 16 explicit image/reference-guided endpoints. The latest named families found in fal's current catalog include MiniMax H3 Max, Seedance 2.5, Grok Imagine 1.5, Wan 3.0, Happy Horse 1.1 and Gemini Omni Flash, alongside Kling O3/3.0, Veo 3.1, LTX 2.3 and PixVerse V6. Use the endpoint-specific source links below, not assumptions from model names.

- [MiniMax H3 Max Turbo API](https://fal.ai/models/minimax/h3-max-turbo/image-to-video/api)
- [Seedance 2.5 API](https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api)
- [Kling O3 reference API](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api)
- [Veo 3.1 API](https://fal.ai/models/fal-ai/veo3.1/image-to-video/api)
- [Grok Imagine 1.5](https://fal.ai/grok-imagine-video-1.5)
- [Wan 3.0](https://fal.ai/wan-3)
- [LTX 2.3](https://fal.ai/ltx-2.3)
- [PixVerse V6](https://fal.ai/pixverse-v6)
- [Happy Horse 1.1 API](https://fal.ai/models/alibaba/happy-horse/v1.1/image-to-video/api)
- [Gemini Omni Flash API](https://fal.ai/models/google/gemini-omni-flash/image-to-video/api)

All integrations use fal-hosted APIs; there are no new self-hosted model deployments. Public API availability does not prove account entitlement or output quality. `node scripts/verify-film-models.mjs` performs public schema GETs only. `--snapshot` refreshes generated contract test fixtures. Never use a broad generic payload: adapters handle image_url versus start_image_url, string versus numeric durations, Seedance's auto aspect ratio, and differing audio flags.

All 16 adapters accept six- and eight-second shots. Supported films are 24s (3 shots), 48s (6), 60s (8), 120s (15) and 180s (23). The 180-second schedule is 21 eight-second shots followed by two six-second shots. Duration payloads are model-specific, and the same schedule is enforced by the planner, action, worker and reservation RPC. Character portraits and shot opening frames use the existing configured GPT Image 2.5 Sunburst integration. Kling variants additionally get cast elements. Native generated sound is optional in exports; some models always generate it upstream. No best-quality claim is made without a like-for-like paid benchmark.

## Security and compatibility

- New `/studio/films` creator and film-mode editor reuse the established private `cartoon_projects` storage/job engine. `brief.kind = short-film` separates film projects from cartoons.
- The new service-only `start_short_film_job` RPC validates mode, model, length and resolution and reserves server-calculated credits. It does not change existing cartoon pricing or reservations.
- Existing owner RLS, worker-only artifacts, immutable generation snapshots, fal request-ID recovery, cancellation and exactly-once settlement remain in force.
- Cast design and the story/world bible remain locked. Story edits invalidate the completed output reference; new renders build fresh shot frames. This release has no per-shot regeneration or visual timeline.
- Completed films remain compatible with the existing social publishing library via its cartoon storage source, but navigate back to the film editor.
- The SEO feature definition uses the existing publication-aware catalog, canonical metadata, sitemap, social preview and SoftwareApplication/Breadcrumb schema. No invented ratings, footage, reviews or quality benchmarks.

## Credits

40 credits for planning/cast; rendering is model rate × duration + 10 credits per generated shot frame. These are ETA retail credit prices, not fal prices. Silent output has the same price. Test parity between the TypeScript and SQL rate cards before rollout.

## Release order

1. Run typecheck, lint, tests (including PostgreSQL integration), build and desktop/mobile preview.
2. Apply `20261003142755_short_film_studio.sql` if not already applied, then `20261003162233_long_film_continuity.sql` to the intended Supabase project. The latter replaces only the service-role reservation function and does not alter balances or existing job snapshots.
3. Deploy the updated Trigger worker; an old worker cannot parse the new film models/durations. Confirm any deployment/version pin used by the web environment points to the updated worker.
4. Deploy the web app from the same revision. No new secrets are needed beyond the existing fal, Supabase and Trigger credentials.
5. With an approved generation budget, run a 24-second film using a real account, inspect the cast/shot plan and final MP4, then test a second model. Verify private links, cancellation, billing and publishing-library inclusion. Do not represent contract tests as a paid visual benchmark.

This document records the release procedure, not confirmation that production deployment or paid inference has occurred.

## Local verification

The user story is: choose a film brief → save a private project → approve cast/story planning → edit the shots → reserve render credits → run reference-guided fal jobs → assemble a private MP4 → return through Projects, Jobs or publishing.

| Boundary | Evidence | Scope |
| --- | --- | --- |
| Creator and editor | Desktop and 390px mobile browser checks; model/length estimates update, 16 model options, continuity-state propagation, fixed guided-shot order, no overflow or browser errors | Local interactive preview, not a signed-in paid session |
| Client → action | Authenticated action tests validate input, reject foreign references and dispatch film reservations to the dedicated RPC | Isolated tests |
| Action → database | Real PostgreSQL-compatible PGlite runs the new migration, owner isolation, all 16 model rates at all five durations, consent, reservation, cancellation and settlement | Local database, no production migration |
| Worker → fal | All 16 public endpoint schemas fetched and stored; generated payloads validated against them; worker orchestration tested with fake providers | No account-entitlement or visual-quality guarantee |
| Worker → private result | 23 reference frames and video clips are assembled for a 180s run; a missing tail is reconstructed without regenerating a completed clip; incomplete exports are rejected; failed jobs refund once | Mock provider/encoder and real local database tests, not paid output |
| Public discovery | Canonical URL, description, SoftwareApplication and Breadcrumb schema, homepage entry and sitemap membership verified in the browser | Development correctly remains noindex; production indexability covered in SEO tests |
| Build and code quality | Production build, TypeScript and application/worker/test lint pass | Full repository lint additionally encounters the pre-existing untracked `tmp/assets/export-eta-meta-icon.cjs` require-import errors |

Original short-film baseline: 904 tests passed across 66 files. Production migration, worker/web deployment and a budget-approved real film render remain release steps. The local environment uses preview fixtures, so a signed-in production end-to-end run is not represented as completed.

## 180-second continuity upgrade

- One prompt produces the complete plan before animation: fixed cast portraits, a logline and intended ending, world rules, up to three recurring locations and five props. The strict film-only response schema requires these fields; legacy short plans and Cartoon Studio remain readable.
- Each shot declares its setup/escalation/payoff beat, location, visible props, transition and start/end story states. Ordered acts, known IDs, exact state chaining, cast/location changes and total runtime are checked before paid video calls. A new film draft may receive one bounded, separately checkpointed continuity repair before cast rendering. This is structural validation, not semantic or visual proof.
- Opening-frame generation receives immutable cast portraits first, the FIRST frame of the current location when returning to it, and the previous normalized clip's final frame for a continuous shot. These roles are labeled explicitly. Only cast images become Kling character elements. The image-edit endpoint supports these references; see [fal's GPT Image 2.5 overview](https://fal.ai/gpt-image-2.5).
- The editor displays the fixed bible and linked states. Changing an ending state also updates the next starting state. Guided shot order stays fixed; manual action changes still require human review for narrative consistency. Action text is capped so it reaches the video adapter intact.
- Every frame, raw clip, normalized clip, last-frame reference and provider request/result has a private durable checkpoint. A transient provider-read failure no longer cancels a resumable request. Explicit cancellation, polling exhaustion and failure to persist the submitted request ID still cancel where possible. Ambiguous submissions are never silently repeated.
- Films reject source clips more than 0.15s short. After assembly, both video and audio stream durations must match the planned runtime within one second of container/codec tolerance. A truncated export is never saved as a successful result. Long-film exports use a separate 400 MB streaming allowance below the schema's 500 MB bucket cap; source downloads remain capped at 100 MB, and encoding stays at the existing CRF 20 quality. Verify the actual hosted Storage/global file-size allowance before release.
- Worker compute budget is bounded at 7200s; provider polling remains bounded per stage. [Trigger's durable waits do not consume maxDuration](https://trigger.dev/docs/runs/max-duration). Completed shots survive a worker retry. A new user-initiated render is still a new paid stage.
- No new environment-variable names or API keys. Existing FAL_KEY, Supabase and Trigger credentials are reused. Do not enable the web release before migrating and deploying the compatible worker.

### Verification scope and remaining release checks

Final local regression: **931 tests passed across 67 files**; TypeScript, changed-file lint and production build passed. Browser checks confirmed the 180s quote (2,430 total credits for Kling O3), linked-state editing, no horizontal overflow at 390px and no error overlay or browser error report.

Automated tests use real local PGlite SQL and mocked AI/encoder services: all duration/rate combinations, six/eight-second contracts for 16 endpoints, required film schemas, state/ID validation, reference order, 23-shot orchestration, interrupted-tail recovery, truncated exports, authorization and exactly-once credit settlement. Desktop and 390px mobile previews verify the 180s selection and estimate, continuity editing, overflow and browser errors. TypeScript, scoped lint and production build are checked separately.

No paid three-minute generation or production migration/deployment has been performed as part of this change. References reduce drift; they cannot guarantee identical faces, hands, voices, lip sync or flawless plot interpretation. There is no automatic vision QA, voice cloning, individual-shot regeneration UI or separately mixed continuous soundtrack. Budget-approved visual validation is required before claiming production quality. Long movies are assembled by ETA automatically, not generated in one native 180s model call.
