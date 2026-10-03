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

Every model receives eight-second shots. Three/six shots yield a 24/48-second MP4. Character portraits and shot opening frames use the existing configured GPT Image 2.5 Sunburst integration. Kling variants additionally get cast elements. Native generated sound is optional in exports; some models always generate it upstream. No best-quality claim is made without a like-for-like paid benchmark.

## Security and compatibility

- New `/studio/films` creator and film-mode editor reuse the established private `cartoon_projects` storage/job engine. `brief.kind = short-film` separates film projects from cartoons.
- The new service-only `start_short_film_job` RPC validates mode, model, length and resolution and reserves server-calculated credits. It does not change existing cartoon pricing or reservations.
- Existing owner RLS, worker-only artifacts, immutable generation snapshots, fal request-ID recovery, cancellation and exactly-once settlement remain in force.
- Cast design remains locked. Story edits invalidate the completed output reference; new renders build fresh shot frames. This release has no per-shot regeneration or visual timeline.
- Completed films remain compatible with the existing social publishing library via its cartoon storage source, but navigate back to the film editor.
- The SEO feature definition uses the existing publication-aware catalog, canonical metadata, sitemap, social preview and SoftwareApplication/Breadcrumb schema. No invented ratings, footage, reviews or quality benchmarks.

## Credits

40 credits for planning/cast; rendering is model rate × duration + 10 credits per generated shot frame. These are ETA retail credit prices, not fal prices. Silent output has the same price. Test parity between the TypeScript and SQL rate cards before rollout.

## Release order

1. Run typecheck, lint, tests (including PostgreSQL integration), build and desktop/mobile preview.
2. Apply `20261003142755_short_film_studio.sql` to the intended Supabase project. It is additive and does not alter balances.
3. Deploy the updated Trigger worker; an old worker cannot parse the new film models/durations. Confirm any deployment/version pin used by the web environment points to the updated worker.
4. Deploy the web app from the same revision. No new secrets are needed beyond the existing fal, Supabase and Trigger credentials.
5. With an approved generation budget, run a 24-second film using a real account, inspect the cast/shot plan and final MP4, then test a second model. Verify private links, cancellation, billing and publishing-library inclusion. Do not represent contract tests as a paid visual benchmark.

This document records the release procedure, not confirmation that production deployment or paid inference has occurred.

## Local verification

The user story is: choose a film brief → save a private project → approve cast/story planning → edit the shots → reserve render credits → run reference-guided fal jobs → assemble a private MP4 → return through Projects, Jobs or publishing.

| Boundary | Evidence | Scope |
| --- | --- | --- |
| Creator and editor | Desktop and 390px mobile browser checks; model/length estimates update, 16 model options, scene reordering, no overflow or browser errors | Local interactive preview, not a signed-in paid session |
| Client → action | Authenticated action tests validate input, reject foreign references and dispatch film reservations to the dedicated RPC | Isolated tests |
| Action → database | Real PostgreSQL-compatible PGlite runs the new migration, owner isolation, all 16 model rates at both durations, consent, reservation, cancellation and settlement | Local database, no production migration |
| Worker → fal | All 16 public endpoint schemas fetched and stored; generated payloads validated against them; worker orchestration tested with fake providers | No account-entitlement or visual-quality guarantee |
| Worker → private result | Three reference frames and video clips are assembled; failed jobs refund once; foreign output paths rejected | Mock provider/encoder and real local database tests, not paid output |
| Public discovery | Canonical URL, description, SoftwareApplication and Breadcrumb schema, homepage entry and sitemap membership verified in the browser | Development correctly remains noindex; production indexability covered in SEO tests |
| Build and code quality | Production build, TypeScript and application/worker/test lint pass | Full repository lint additionally encounters the pre-existing untracked `tmp/assets/export-eta-meta-icon.cjs` require-import errors |

Final regression result: 904 tests passed across 66 files. Production migration, worker/web deployment and a budget-approved real film render remain release steps. The local environment uses preview fixtures, so a signed-in production end-to-end run is not represented as completed.
