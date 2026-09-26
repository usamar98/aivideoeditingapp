# Creator 24-hour promotion

The shared campaign window is defined in `src/lib/billing/creator-offer.ts`: September 26, 2026 at 14:11:03 UTC through September 27, 2026 at 14:11:03 UTC (19:11:03 Pakistan time). It does not reset on refresh, sign-in, server restart, or redeployment. A no-store server-clock endpoint drives the timer; checkout enforces the same deadline independently.

## Customer terms

- First-time subscribers to the base Creator monthly plan only. Annual subscriptions, larger credit bundles, and existing or former subscriptions are excluded.
- $49.99 today for two months of access, with 1,100 credits included for that two-month period.
- Then $49.99/month and 1,100 credits after each successful paid monthly invoice. Future renewals can be cancelled in account settings.
- An offer checkout started before the campaign deadline reserves its terms for 31 minutes. The extra minute above Stripe's minimum expiry covers request latency. A new checkout cannot claim the offer after the deadline.

## Stripe implementation

Checkout contains the existing $49.99 Creator recurring price plus a one-time $49.99 item on the same product. The recurring item has `trial_end` set two calendar months after checkout creation, with end-of-month clamping. Stripe charges the one-time item upfront and starts monthly billing after that date. Stripe may label the deferred recurring item a trial; checkout custom text explains the paid promotional period and renewal terms.

No new API keys, permanent catalog prices, coupons, database migrations, or Trigger deployment are needed for this promotion. The existing base Creator price, Stripe key, webhook secret, customer portal, and billing database must already work. No existing customer subscription is edited by this release. An inline one-time price is created only when a customer opens an eligible checkout.

The signed `invoice.paid` webhook retrieves the invoice and prices from Stripe. It validates the initial offer's immutable subscription metadata, workspace, campaign start, renewal date, product, USD amount, quantities, and both invoice lines. It grants 1,100 credits under the existing atomic `stripe:invoice:<id>` ledger key. Zero-dollar invoices grant nothing; regular paid renewals retain the normal monthly allocation. Failed/malformed fulfillment remains retryable instead of marking the event processed.

## Verification and operating notes

- Tests cover checkout eligibility, the fixed deadline, stale clicks, session reuse/replacement, first invoice allocation, renewal allocation, zero-dollar invoices, malformed invoices, and duplicate events. No live payment is created by automated tests.
- Before relying on live sales, verify this two-item checkout and the first invoice in a Stripe sandbox; then use a Stripe test clock to confirm the later monthly renewal. No live card charge or test-clock run was performed during implementation.
- In Stripe Billing settings, enable trial/promotion reminder emails and confirm the portal supports payment updates and cancellation. Follow Stripe's [trial and promotion requirements](https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance).
- Keep this campaign's validation constants and invoice handler after the deadline so delayed payment webhooks can still be fulfilled. The UI and checkout automatically revert to the regular plan after expiry. A future campaign needs a new ID and an explicit owner-approved window; do not roll this deadline forward automatically.
- The public promotion starts when this code is deployed and remains claimable only until the fixed deadline above. Deployment delays do not extend or restart its timer.
