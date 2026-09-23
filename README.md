# FrameFoundry

FrameFoundry is a multi-feature AI video studio with a cream-and-blue public site, a generic faceless-video workflow, a recurring-character cartoon editor, private projects, durable rendering, Stripe billing, and account settings.

Start with [the deployment guide](docs/DEPLOYMENT.md) for the exact Vercel/worker variables, Stripe product/portal/webhook setup, migrations, and launch checklist. [Faceless workflow research](docs/FACELESS-RESEARCH.md) explains the product examples and deliberately bounded feature scope.

The checked-in **Pip & Moss** project is an explicitly labelled development fixture. Its generated reference and storyboard art lets the full review/edit/reorder/approve/caption workflow run without spending provider credits. The application never reports that fixture work as a successful provider generation.

## Local development

Requirements: Node.js 22+, npm, and (for local video assembly) FFmpeg 7.

```bash
npm install --include=dev
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Run all local verification with:

```bash
npm run check
```

## Production setup

1. Create a Supabase project and apply the three files in `supabase/migrations/` in order, skipping those already applied. Existing installations with faceless/Stripe support need `20260923173517_jobs_cancellation.sql`. Add `api` to **Project Settings → API → Exposed schemas**. Set the site URL and `/auth/callback` redirect in Auth settings.
2. Create a Trigger.dev project, add the worker environment variables from the deployment guide, and deploy both `trigger/episode-pipeline.ts` and `trigger/faceless-pipeline.ts` using `trigger.config.ts`. The Trigger build bundles FFmpeg 7 and caption fonts; the web request only queues work.
3. Preview the three monthly/yearly plans with `npm run billing:setup`. To create the six matching Stripe prices, securely set `STRIPE_SECRET_KEY` in the terminal environment and run `npm run billing:setup -- --apply` (live mode also requires `--live`). The script does not automatically load `.env.local`. Activate the customer portal and point signed webhooks at `/api/webhooks/stripe`. Only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are needed as Stripe environment variables; there are no monthly/yearly price-ID variables. See the deployment guide for exact prices, manual catalog setup, required events, and portal settings. Annual plans grant 12× the monthly credits upfront per paid year.
4. Add Gemini, fal.ai, and ElevenLabs API credentials. Provider subscriptions on consumer websites do not imply API access. Confirm commercial rights, regional availability, pricing, and the chosen preset voices before enabling paid generation.
5. Deploy the Next.js app to Vercel with `NEXT_PUBLIC_DEMO_MODE=false`, the production site URL, all server secrets, and the public Supabase values. Do not expose `SUPABASE_SECRET_KEY` or any provider key with a `NEXT_PUBLIC_` prefix.
6. Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to the Search Console HTML-tag token, redeploy, verify the property, and submit `/sitemap.xml`. Only canonical published features enter the sitemap.

Start from `.env.example`; it documents every required value. `MEDIA_FETCH_HOSTS` should contain a comma-separated allowlist of hosts that the render worker may download from.

## Architecture and trust boundaries

- Public marketing and feature pages are statically rendered where possible. The editor is isolated as a client component, so its interaction code is not shipped with marketing pages.
- Supabase RLS isolates every workspace-scoped table. Uploaded and generated media lives in a private bucket. Publishing a public example is a separate, explicit data path.
- Each paid generation is recorded before submission. A row-locked database function reserves credits; a final Trigger lifecycle hook settles actual usage or releases the reservation after retries are exhausted.
- The Jobs sidebar opens `/studio/jobs`: running, done, failed, and cancelled job history with live refresh. Owner-only cancellation requests stop the backend worker; credits and the active slot are released atomically after termination is confirmed. Apply the jobs migration and deploy both updated workers before enabling this web UI. Provider-side work already in progress may not stop immediately.
- Trigger.dev owns retries and job state. Inputs are HTTPS-only, remote hosts can be allowlisted, input size is capped, FFmpeg has a timeout, and output is uploaded to an application-controlled signed URL.
- Stripe webhook signatures are checked against the exact raw body with the SDK's timestamp tolerance. Event and invoice ledger IDs make retries safe. Customers can manage payment methods, plan changes, invoices, and cancellation through authenticated portal sessions.
- Feature content, metadata, structured data, related links, social images, robots behavior, and sitemap membership all derive from the same Zod-validated feature record. Draft development fixtures are not indexable in production.

## Provider choices

- Gemini uses `gemini-3.8-flash` through structured output and validates the result with the appropriate episode or faceless-storyboard Zod schema.
- The faceless worker uses `fal-ai/flux/schnell` for scene illustrations. Cartoon adapters target `fal-ai/nano-banana-pro/edit` for reference-guided image revisions and `fal-ai/kling-video/v3/pro/image-to-video` for 3–15 second approved scene animation.
- ElevenLabs uses the timestamped text-to-speech endpoint so returned word timing can drive captions and scene duration validation.

These adapters are intentionally small and replaceable. Character consistency remains a reviewable quality target, never a guarantee. Lip-sync is not enabled in this release.

## Release checklist

- Replace the example support email and confirm the product name, legal entity, privacy policy, terms, retention/deletion policy, music licenses, and customer-facing credit prices.
- Verify provider-generated character identity across the supported poses, animals, camera angles, languages, and voices. Keep lip-sync off until each supported style passes an explicit quality gate.
- Exercise signup/email confirmation, a real purchase, webhook replay, low-balance rejection, cancellation, provider timeout recovery, private asset isolation, signed download expiry, and MP4 playback in the production environment.
- Validate feature structured data and published example `VideoObject` data after durable public video URLs and thumbnails are configured.
- Measure Core Web Vitals from production field data before making performance claims. Development builds and Lighthouse runs are laboratory signals only.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js development server |
| `npm run typecheck` | Strict TypeScript validation |
| `npm run lint` | Next/React ESLint rules |
| `npm run test` | Focused Vitest suite |
| `npm run build` | Optimized production build |
| `npm run check` | Typecheck, lint, tests, and production build |

The tests cover storyboards and captions, account actions, Stripe catalog/signatures/retries, database permissions and credit transactions, character reuse, scene replacement, duration validation, feature SEO publication rules, and workspace isolation. Live provider, hosted worker, and test-mode Stripe checks remain part of the release checklist.
