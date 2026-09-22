# Deploy the multi-feature studio

## 1. Database and authentication

Apply the migrations in order to Supabase:

1. `supabase/migrations/202609220001_initial_video_saas.sql`
2. `supabase/migrations/20260922145706_faceless_stripe_profiles.sql`

If the initial migration is already applied, apply **only the second**. The second migration adds private faceless projects, usernames, Stripe customer/subscription mappings, and server-only job transactions. It also fixes profile column grants and restricts credit settlement to trusted workers. Expose the `api` schema in the Data API settings as described in the first migration. Configure your site URL and `https://YOUR_DOMAIN/auth/callback` in Supabase Auth redirect settings. Configure production SMTP before accepting signups.

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

1. Create your actual products and recurring, fixed per-unit prices. Set each allowed **Product** metadata `app=framefoundry`. Set each **Price** metadata `credits` to the positive integer granted per paid billing period, e.g. `100`. Do not change an existing Price's credit allocation after customers subscribe; create a new Price instead. Unmarked, archived, usage-based, free, or malformed prices are not offered in checkout.
2. The app discovers these active prices server-side. Set real amounts and billing intervals in Stripe; there are no invented prices in the code or environment configuration. Checkout permits one unit of one recurring plan per customer. Open checkout sessions are reused; competing requests are gated with a short database lease.
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

Only paid, positive-value first/renewal invoices grant credits. Subscription-update prorations, unpaid invoices, zero-value invoices, and browser success redirects do not. Invoice IDs make credit fulfillment transactional and idempotent. Failure returns HTTP 500 for Stripe retry. Canceling stops future renewal as configured in the portal; previously purchased credits remain usable. Refunds/disputes require operator handling; automatic credit clawbacks are not implemented. Reconcile those before any production launch policy is finalized.

The new app has replaced Paddle routes and variables. Existing Paddle customers, if any, are not migrated automatically.

## 4. Trigger.dev worker

Deploy `trigger.config.ts` with the matching Trigger CLI version and your project reference. Both `episode-pipeline` and `faceless-pipeline` must be deployed separately from Vercel. Set these worker secrets:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- `GEMINI_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`
- `TRIGGER_PROJECT_REF` for deployment

The build includes FFmpeg 7 and DejaVu fonts for captions. Let the extension set `FFMPEG_PATH` and `FFPROBE_PATH` in production. No worker Stripe key is needed. The older cartoon export worker uses `MEDIA_FETCH_HOSTS` for additional exact media hosts; Supabase's host is included automatically. The faceless worker only fetches image results from fal.media over HTTPS, rejects redirects, and copies outputs into your private Supabase bucket.

Each project has an addressable URL. Jobs store input snapshots, provider output/usage metadata, image request IDs, voice timing, and completed clips. Retries reuse those artifacts. There remains a provider response/persistence crash window, so do not claim exactly-once provider charging. An uncertain dispatch keeps its reservation; use **Reconnect job** with the same job ID. Configure Trigger alerts for terminal failures and failed lifecycle hooks. Investigate stuck jobs before manually refunding, so an active worker cannot complete unpaid.

There is no free signup credit grant. Assign marked Stripe plans, or explicitly grant test credits through trusted administration to test AI jobs. Faceless limits are two active jobs per workspace and 50 new generation jobs per account per day.

## 5. Verify before launch

Run `npm run check`. Tests include an isolated PGlite Postgres harness with Supabase auth/storage stubs; they do not substitute for hosted Supabase integration tests.

With test-mode credentials, verify signup/confirmation, a unique username change, current-password verification, successful password change, and sign-out. Buy a plan in Checkout; verify one credit grant after `invoice.paid`, including replaying the event. Test plan switching, failed payment/action-required, updating the card, cancellation, undoing cancellation where supported, and invoice downloads. Confirm another user cannot open the first user's billing portal or project.

Create an idea-based script and a pasted-script project. Refresh during generation. Edit/reorder scenes, save and approve, then render both aspect ratios. Play the downloaded MP4 and verify audible narration, caption synchronization, duration, and privacy. Test provider failure, worker retry, insufficient credits, duplicate clicks, and expired signed downloads.

No live purchase, provider generation, or hosted worker rendering has been verified merely by passing local tests. Replace support/legal placeholders, set retention and refund policies, monitor spend, and verify provider commercial rights before accepting paying users.
