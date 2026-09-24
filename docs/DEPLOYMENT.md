# Deploy the multi-feature studio

## 1. Database and authentication

Apply the migrations in order to Supabase:

1. `supabase/migrations/202609220001_initial_video_saas.sql`
2. `supabase/migrations/20260922145706_faceless_stripe_profiles.sql`
3. `supabase/migrations/20260923173517_jobs_cancellation.sql`

Apply only migrations that have not already been applied. If the first two are installed, run only the third SQL file in Supabase SQL Editor (or apply it through your migration workflow). The second migration adds private faceless projects, usernames, Stripe customer/subscription mappings, and server-only job transactions. It also fixes profile column grants and restricts credit settlement to trusted workers. The third adds cancellation state, guarded worker claims, and atomic completion/cancellation transactions; it does not cancel existing jobs or change balances. Expose the `api` schema in the Data API settings as described in the first migration. Configure your site URL and `https://YOUR_DOMAIN/auth/callback` in Supabase Auth redirect settings. Configure production SMTP before accepting signups.

For the Jobs rollout, apply the third migration, deploy **both updated Trigger.dev workers**, then deploy the web app. Do not enable cancellation against only the old worker code. The database also prevents a late older worker from changing a terminal job back to running or publishing new output.

## 2. Vercel variables

Set these in the project's Production environment, replace placeholders, then redeploy:

```dotenv
NEXT_PUBLIC_PRODUCT_NAME=FrameFoundry
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
NEXT_PUBLIC_SUPPORT_EMAIL=YOUR_SUPPORT_EMAIL
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
GEMINI_API_KEY=YOUR_GEMINI_KEY
FAL_KEY=YOUR_FAL_KEY
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_KEY
ELEVENLABS_DEFAULT_VOICE_ID=YOUR_LICENSED_VOICE_ID
TRIGGER_SECRET_KEY=YOUR_TRIGGER_PRODUCTION_KEY
TRIGGER_PROJECT_REF=YOUR_TRIGGER_PROJECT
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_ENDPOINT_SIGNING_SECRET
```

There are **no Stripe monthly/yearly Price ID environment variables**. Hosted Stripe Checkout and the billing portal do not require a browser publishable key. Test mode is selected by using Stripe test credentials and a test-mode webhook endpoint; use live credentials only after end-to-end tests pass. Keep Preview environments on separate test credentials/data.

Never prefix provider, Stripe, or Supabase secret keys with `NEXT_PUBLIC_`. `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is optional. Existing legacy limit variables in `.env.example` are not the faceless pricing source: faceless script/render reservations are 2/20 credits in the new database transaction and UI. Change both together if changing these prices.

## 3. Stripe products and portal

In your Stripe test dashboard:

1. The three public plans are defined in `src/config/pricing.json`. Create the matching catalog with `npm run billing:setup` (preview only, no API calls), then set `STRIPE_SECRET_KEY` securely in your terminal environment and run `npm run billing:setup -- --apply` in test mode. The script does not read `.env.local` automatically. Live-mode creation additionally requires `--live`. It creates three products and six recurring prices, reuses matching lookup keys on retry, and stops on a mismatch instead of overwriting any existing allocation. This is a one-time setup per Stripe account/mode, not a build step.
2. The app discovers matching active prices server-side and validates their lookup key, USD amount, interval, and credits against the public plan before allowing checkout. There are no monthly/yearly Price ID environment variables. Unconfigured cards are disabled in account billing. Checkout permits one unit of one recurring plan per customer. Open checkout sessions are reused; competing requests are gated with a short database lease. Existing subscriptions and their credit allocations are not changed by the new catalog.
3. Activate the **Customer portal**. Enable payment method updates, invoice history, subscription cancellation at period end, and subscription updates. Select the marked products/prices customers may switch between. Keep quantity changes disabled. Prefer plan changes at renewal: prorated change invoices do not grant a second full credit allocation. Resume an end-of-period cancellation through Manage subscription when the portal permits it.
4. Add webhook URL `https://YOUR_DOMAIN/api/webhooks/stripe`. Subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
5. Copy this endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`. Use the Stripe API version matching the installed `stripe` SDK when configuring the endpoint. The handler re-fetches current invoice/subscription objects using the SDK before processing them.

### Exact catalog (USD)

| Plan | Monthly payment / credits | Yearly monthly equivalent | Yearly payment / upfront credits |
| --- | --- | --- | --- |
| Starter | $29.99 / 440 | $19.99 | $239.88 / 5,280 |
| Creator | $49.99 / 1,100 | $29.99 | $359.88 / 13,200 |
| Studio | $99.99 / 2,200 | $79.99 | $959.88 / 26,400 |

Annual plans charge once per year and grant all twelve months of credits upfront after the paid invoice, including each paid annual renewal. They do **not** grant a monthly refill as well. Monthly plans grant credits after each paid month. No database migration or extra environment variable is needed for these tiers.

For manual dashboard setup, set Product metadata `app=framefoundry` and `tier=starter`, `creator`, or `studio`. Add two fixed per-unit, licensed, recurring USD Prices per Product with interval count 1. Use the amounts above (the yearly price is the full yearly charge), and set Price metadata `credits` to the complete per-payment allocation. Set each Price's **lookup key** to `framefoundry_<tier>_month_v1` or `framefoundry_<tier>_year_v1`, e.g. `framefoundry_creator_year_v1`. The script's preview prints all six exact lookup keys. Do not change an existing Price's credits after customers subscribe; use a new versioned Price and update the public catalog matching logic instead. Do not archive old prices until you have reviewed any existing subscribers.

Only paid, positive-value first/renewal invoices grant credits. Subscription-update prorations, unpaid invoices, zero-value invoices, and browser success redirects do not. Invoice IDs make credit fulfillment transactional and idempotent. Failure returns HTTP 500 for Stripe retry. Canceling stops future renewal as configured in the portal; previously purchased credits remain usable. Refunds/disputes require operator handling; automatic credit clawbacks are not implemented. Reconcile those before any production launch policy is finalized.

The new app has replaced Paddle routes and variables. Existing Paddle customers, if any, are not migrated automatically.

## 4. Trigger.dev worker

`trigger.config.ts` targets `proj_buramjqzkflsxgozeeew` and discovers exports in `src/trigger/`. That directory registers `connectivity-check` and re-exports the existing video workers. Use the matching CLI version (currently `4.6.4`); both `episode-pipeline` and `faceless-pipeline` must be deployed to **Production** separately from Vercel. Set these worker secrets:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- `GEMINI_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`

The project reference is already in `trigger.config.ts`; change it there when targeting another project. For local **Development**, use `npm run dev:trigger` with the Development key in `.env`, then `npm run test:trigger` to verify a harmless task. The local worker must stay running, and real video jobs need the secrets above in `.env` as well. The connectivity check alone does not verify AI rendering, database access, or recovery of old stuck jobs. See the README's development setup. Production requires a separate worker deployment and a matching Production secret key on Vercel; do not use `tr_dev_` for an always-on production website.

The build includes FFmpeg 7 and DejaVu fonts for captions. Let the extension set `FFMPEG_PATH` and `FFPROBE_PATH` in production. No worker Stripe key is needed. The older cartoon export worker uses `MEDIA_FETCH_HOSTS` for additional exact media hosts; Supabase's host is included automatically. The faceless worker only fetches image results from fal.media over HTTPS, rejects redirects, and copies outputs into your private Supabase bucket.

The runtime is pinned to `node-22` for native WebSocket support. `faceless-pipeline` uses `medium-2x` (2 vCPU / 4 GB RAM); this costs more than the default 0.5 GB worker. FFmpeg uses one decoder/filter thread and two video encoder threads. Images and MP4 checkpoints stream to/from task-owned temporary files, with bounded transfer sizes; only small JSON/base64 voice responses are buffered. Cancellation checkpoints, private storage paths, and credit settlement remain unchanged. No database migration or new environment variable is needed.

After deploying, run the exported `render-smoke-check` task with `{}`. It renders captioned portrait and landscape synthetic clips, concatenates them, and verifies H.264/AAC output with FFprobe on the same machine preset. It makes no AI calls or database/storage writes and uses no app credits (normal Trigger compute still applies). This validates the rendering toolchain, not an end-to-end paid video generation. Do not replay refunded/cancelled jobs from the Trigger dashboard; create a new job through the app.

Each project has an addressable URL. Jobs store input snapshots, provider output/usage metadata, image request IDs, voice timing, and completed clips. Retries reuse those artifacts. There remains a provider response/persistence crash window, so do not claim exactly-once provider charging. An uncertain dispatch keeps its reservation; use **Reconnect job** with the same job ID. Configure Trigger alerts for terminal failures and failed lifecycle hooks. Investigate stuck jobs before manually refunding, so an active worker cannot complete unpaid.

There is no free signup credit grant. Assign marked Stripe plans, or explicitly grant test credits through trusted administration to test AI jobs. Faceless limits are two active jobs per workspace and 50 new generation jobs per account per day.

### Jobs and cancellation

`/studio/jobs` is available from the studio sidebar and mobile header. It lists the signed-in user's AI scripts, faceless renders, and episode exports in Running, Done, Failed, and Cancelled tabs, with paginated history and automatic refresh. Workspace limits can also include jobs created by other workspace members; users cannot cancel another member's jobs.

Cancel job records the stop request immediately, verifies that the Trigger run payload belongs to that exact job, and calls Trigger's cancellation API. Workers check the request before each stage and pass abort signals to provider requests, downloads, and FFmpeg. Active fal image requests are cancelled on a best-effort basis. Third-party inference already running may still finish or incur provider charges; aborting an HTTP request cannot guarantee provider-side termination.

For jobs that have **never been claimed**, cancellation returns reserved credits and releases the database slot immediately, even if no Trigger run ID was saved or Trigger is unavailable. The server first commits the cancellation flag, then reads the job again and requires a pre-start status, exactly zero attempts, and no previous settlement. The existing locked `claim_generation_job` RPC rejects every later claim before paid work; a queued Trigger run may wake up but cannot process the cancelled job. Do not deploy this behavior against older workers that bypass that claim RPC. No additional migration is needed beyond the three above.

For jobs that **have started**, the page shows **Cancelling** until worker termination is confirmed. Only then are reserved credits returned and the slot released together, once. Cancelled faceless projects return to draft/ready with their saved storyboard intact, and cancelled outputs are not published. Completed jobs are not refunded by cancellation. A database guard prevents cancelled jobs from being restarted by a late write.

Vercel needs the existing `TRIGGER_SECRET_KEY` for the **same project and environment** as the workers, plus its existing Supabase secret. No new environment variable is required. For an attempted job, if Trigger is unavailable or a run ID is missing, cancellation stays pending and the UI offers **Retry cancellation**. A failed database read or settlement is also retryable and never reported as success. Missing run IDs for attempted jobs are recovered from Trigger tags only after matching the run payload. An unknown dispatch outcome alone is never evidence that a worker has stopped: immediate settlement requires the database cancellation flag plus the zero-attempt proof described above.

Submission failures now produce a safe `[jobs]` server log with a generation ID, stage (`read_saved_job`, `submit_task`, or `save_run`), inferred key environment, error category, and HTTP/database code when available. Safe summaries are also saved on still-unsettled, unstarted jobs and returned to the requester. Search Vercel runtime logs by generation ID; compare the key environment with the Trigger dashboard and check the named stage. Raw SDK exceptions, messages, request bodies, headers, signed URLs, and keys are deliberately excluded. A diagnostic save failure is logged separately and does not erase the original error. Reconnect retains the same idempotency key; a network failure does not automatically refund a potentially executing task.

## 5. Verify before launch

Run `npm run check`. Tests include an isolated PGlite Postgres harness with Supabase auth/storage stubs; they do not substitute for hosted Supabase integration tests.

With test-mode credentials, verify signup/confirmation, a unique username change, current-password verification, successful password change, and sign-out. Buy a plan in Checkout; verify one credit grant after `invoice.paid`, including replaying the event. Test plan switching, failed payment/action-required, updating the card, cancellation, undoing cancellation where supported, and invoice downloads. Confirm another user cannot open the first user's billing portal or project.

Create an idea-based script and a pasted-script project. Refresh during generation. Edit/reorder scenes, save and approve, then render both aspect ratios. Play the downloaded MP4 and verify audible narration, caption synchronization, duration, and privacy. Test provider failure, worker retry, insufficient credits, duplicate clicks, and expired signed downloads.

Start two jobs, then cancel a queued and an executing job from Jobs. Verify Trigger termination, one credit release per cancelled job, a newly available slot, and no cancelled output being published. Test repeated cancellation, a completion/cancellation race, another user's job ID, Trigger unavailability, and cancellation during image generation, voice generation, and FFmpeg. For jobs created before this release, also test the run-ID recovery path. Local tests cover the database and API contracts; they do not verify termination of live hosted workers.

No live purchase, provider generation, or hosted worker rendering has been verified merely by passing local tests. Replace support/legal placeholders, set retention and refund policies, monitor spend, and verify provider commercial rights before accepting paying users.
