# Credit selectors and proportional subscription prices

Each Starter, Creator and Studio card offers 1×, 2× and 3× its base credit allowance. Both price and credits scale by the selected multiplier. This uses the existing six verified Stripe recurring prices with a licensed line-item quantity, not new price IDs or environment variables.

| Plan | Monthly credit options | Monthly payment options | Annual price/month equivalent |
| --- | --- | --- | --- |
| Starter | 440 / 880 / 1,320 | $29.99 / $59.98 / $89.97 | $19.99 / $39.98 / $59.97 |
| Creator | 1,100 / 2,200 / 3,300 | $49.99 / $99.98 / $149.97 | $29.99 / $59.98 / $89.97 |
| Studio | 2,200 / 4,400 / 6,600 | $99.99 / $199.98 / $299.97 | $79.99 / $159.98 / $239.97 |

Annual checkout charges twelve times the displayed monthly equivalent and issues twelve months of the selected credits upfront. It is not a monthly refill. All prices are USD, before any applicable tax shown at checkout.

## Safeguards

- Marketing links preserve plan, interval and quantity through sign-in to billing.
- Server actions accept only quantities 1, 2 or 3, authenticate the account and verify the immutable base Stripe price against the existing catalog. They do not accept a browser-provided price or credit total.
- Open checkout reuse matches both price and quantity; old sessions for a different selection are expired. Existing subscriptions still go through Manage subscription, preventing accidental duplicate subscriptions.
- The signed `invoice.paid` webhook reads actual Stripe invoice line quantities and verified product/price credit metadata. It grants `base credits × quantity` using the same invoice-id idempotency key as before. Proration and unsupported quantities do not issue credits; unsupported quantities produce a retryable error for review.
- Existing subscriptions are not changed automatically. Existing 1× purchases remain compatible.
- The temporary $1 card and new purchases are disabled, but historical paid-session fulfillment and receipt verification remain supported so delayed payments can receive their promised credits.

## Deployment

No new Supabase migration, API key, Stripe product or price ID is needed. Deploy the website and webhook together. The webhook must still be configured and successfully delivered at `/api/webhooks/stripe`; publishing this code does not fix missing/failed external webhook delivery by itself. No live payments or customer balances were changed during local verification.

Reference: https://docs.stripe.com/billing/subscriptions/quantities
