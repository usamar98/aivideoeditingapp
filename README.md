# FrameFoundry

FrameFoundry is a configurable AI video SaaS foundation whose first end-to-end product surface is a recurring-character cartoon studio. It includes a polished public site, an interactive 30–60 second episode editor, a private multi-tenant data model, durable FFmpeg rendering, credit accounting, billing webhooks, provider adapters, and a typed feature publishing system.

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

1. Create a Supabase project and run `supabase/migrations/202609220001_initial_video_saas.sql` in the SQL editor or Supabase CLI. Add `api` to **Project Settings → API → Exposed schemas**. Set the site URL and `/auth/callback` redirect in Auth settings.
2. Create a Trigger.dev project, add the same server-side environment variables there, and deploy `trigger/episode-pipeline.ts`. The Trigger build bundles FFmpeg 7; the web request only queues work.
3. Create Paddle products/prices after merchant approval. Point a Paddle webhook at `/api/webhooks/paddle`, send only `workspace_id` in transaction `custom_data`, and configure the server-authoritative price-to-credit map in `PADDLE_CREDIT_PRICE_MAP_JSON`. Credit purchase application is transactional and idempotent; client-supplied credit quantities are ignored.
4. Add Gemini, fal.ai, and ElevenLabs API credentials. Provider subscriptions on consumer websites do not imply API access. Confirm commercial rights, regional availability, pricing, and the chosen preset voices before enabling paid generation.
5. Deploy the Next.js app to Vercel with `NEXT_PUBLIC_DEMO_MODE=false`, the production site URL, all server secrets, and the public Supabase values. Do not expose `SUPABASE_SECRET_KEY` or any provider key with a `NEXT_PUBLIC_` prefix.
6. Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to the Search Console HTML-tag token, redeploy, verify the property, and submit `/sitemap.xml`. Only canonical published features enter the sitemap.

Start from `.env.example`; it documents every required value. `MEDIA_FETCH_HOSTS` should contain a comma-separated allowlist of hosts that the render worker may download from.

## Architecture and trust boundaries

- Public marketing and feature pages are statically rendered where possible. The editor is isolated as a client component, so its interaction code is not shipped with marketing pages.
- Supabase RLS isolates every workspace-scoped table. Uploaded and generated media lives in a private bucket. Publishing a public example is a separate, explicit data path.
- Each paid generation is recorded before submission. A row-locked database function reserves credits; a final Trigger lifecycle hook settles actual usage or releases the reservation after retries are exhausted.
- Trigger.dev owns retries and job state. Inputs are HTTPS-only, remote hosts can be allowlisted, input size is capped, FFmpeg has a timeout, and output is uploaded to an application-controlled signed URL.
- Paddle webhook signatures are checked against the exact raw body with a five-minute replay window. Event and ledger IDs make retries safe.
- Feature content, metadata, structured data, related links, social images, robots behavior, and sitemap membership all derive from the same Zod-validated feature record. Draft development fixtures are not indexable in production.

## Provider choices

- Gemini uses the stable `gemini-3.8-flash` model through structured output and validates the result with the episode Zod schema.
- fal.ai adapters target `fal-ai/nano-banana-pro/edit` for reference-guided image revisions and `fal-ai/kling-video/v3/pro/image-to-video` for 3–15 second approved scene animation.
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
| `npm run check` | Typecheck, tests, and production build |

The focused tests cover character reuse, isolated scene replacement, duration validation, generation recovery decisions, credit reservations/settlement, feature SEO publication rules, and RLS declarations.
