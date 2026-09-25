# Temporary $1 credit pack

**Status: retired.** `creditPack.enabled` is `false`. Deploy this version to remove the offer from the homepage, pricing page and account billing, and block new checkout requests. Historical purchase validation, credit delivery and receipt verification remain enabled. Removing the offer does not remove any purchased credits.

This is a genuine **USD $1.00 one-time purchase of 10 ETA credits**, not a subscription, donation, or fake transaction. It does not renew or change an existing plan. The normal monthly/yearly plans are unchanged. Most complete video workflows need more than 10 credits; their studio estimates remain the source of truth.

## Where it appeared before retirement

- Homepage pricing and `/pricing`: **Mini credit pack**, below the subscription cards.
- `/studio/profile?tab=billing#mini-credit-pack`: the signed-in purchase button. Existing subscribers can also buy the pack.
- Marketing buttons navigate to account billing; they never charge a card automatically.

## Going live

Deploy the website changes, including the updated `/api/webhooks/stripe` route. **No new Supabase migration, Stripe price ID, API key, or Trigger deployment is needed for this pack.** It reuses the existing billing tables and service-only `apply_credit_purchase` function. The normal billing database migrations must already be applied.

Use the existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the **same Stripe environment**. Real purchases require live credentials. Test credentials collect no real money; the account screen labels that environment. The checkout button is disabled or rejects the request if payment confirmation is not configured.

In the existing Stripe webhook endpoint, keep all subscription events and ensure **`checkout.session.completed`** is selected. Also select `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` if available. This pack currently accepts cards only, but handles those delayed-payment notifications as well. Do not replace the endpoint or remove invoice/subscription events.

Stripe-hosted Checkout creates the one-time line item server-side at exactly 100 US cents with quantity 1. It does not use the six recurring prices. Promotion codes, adaptive currency pricing, and automatic tax are not enabled on this fixed-total temporary offer; review your tax obligations before offering it more widely.

## Verifying a real purchase

For an existing purchase, sign in with the **ETA account used during checkout** and visit **My account → Billing → Available credits**, then choose **Refresh status**. A pack adds 10 credits to the existing balance; it does not create a subscription, so "No active plan" can still be correct. Do not pay again if credits are missing.

If credits are missing, inspect the live Stripe endpoint's delivery of `checkout.session.completed` to `https://www.editingapp.live/api/webhooks/stripe`. It must reach the current deployment, verify against that endpoint's `STRIPE_WEBHOOK_SECRET`, and persist the credit ledger entry. Correct the failed delivery/configuration and resend the original event; the session-level idempotency key prevents duplicate credit grants. Do not manually add a second purchase with a different key.

The following describes the original purchase flow (new purchases are now disabled):

1. Sign in and open **My account → Billing → Mini credit pack**.
2. Choose **Buy 10 credits · $1.00** and review the one-time amount in Stripe Checkout. The account owner/customer must complete the payment themselves.
3. On return, ETA retrieves the Checkout Session from Stripe and verifies account ownership, amount, currency and paid status. It reports whether the webhook has added the 10 credits. A `success` URL alone never grants credits.
4. Check **Stripe Dashboard → Payments** in the same live account for the completed $1 payment. Stripe payment receipt is not proof that a bank payout has arrived. Check Stripe's balance/payout records separately; processing fees and payout timing apply.
5. If Stripe confirms payment but credits are pending, use **Refresh status** and inspect webhook delivery. Do not pay again to fix a delayed webhook.

Use Stripe's sandbox and test payment details for integration testing. This local implementation was tested with mocked/signed events and an isolated Postgres-compatible test database; no real payment was made or verified. [Stripe testing guidance](https://docs.stripe.com/testing) and [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment).

## Duplicate protection and removal

- Amount, credits, user, workspace and customer are controlled on the server.
- A database lease serializes checkout creation; repeated clicks reuse an open pack session. Network uncertainty retains the short lease. Pack checkouts and subscription checkouts do not expire or replace each other.
- The signed webhook verifies the current session, line item and succeeded PaymentIntent before granting credits. The credit ledger's unique `stripe:checkout:<session-id>` key prevents repeat grants across delivery retries or different event IDs.
- Disable the temporary offer by setting **`creditPack.enabled` to `false`** in `src/lib/billing/credit-pack.ts`, then redeploy. This removes all pack cards and blocks new sessions. Existing sessions expire after approximately 31 minutes; expire any remaining open pack sessions in Stripe if an immediate shutdown is needed.
- **Keep the pack's ID, amount, credit allocation and webhook fulfillment logic unchanged** after disabling it. Already-paid purchases and delayed webhooks must still receive their credits. Do not remove the database ledger entries.
- Refunds remain a support-operated process. Refunding in Stripe does not automatically remove already-granted app credits; review usage and handle the account adjustment through your existing support process.
