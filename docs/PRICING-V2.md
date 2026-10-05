# Pricing cards and catalog v2 — 5 October 2026

The reference layout is adapted to ETA's existing cream, navy and blue theme. Growth has the full-width Most Popular header. Creator and Growth each have an accessible range control and three clickable credit pills. Enterprise routes to Contact; it is not a zero-dollar subscription.

The user's latest instruction sets regular monthly base prices to **$9 / $49 / Custom**. There is no $15 renewal or introductory discount. Included workflows remain based on ETA's existing pricing cards; no competitor-only tools, unlimited usage, API service, or invented enterprise promises are advertised.

| Plan | Monthly credits | Monthly payment | Annual payment / credits upfront |
| --- | --- | --- | --- |
| Creator | 200 / 400 / 600 | $9 / $16.20 / $22.95 | $86.40 / 2,400; $155.52 / 4,800; $220.32 / 7,200 |
| Growth | 1,100 / 2,200 / 3,300 | $49 / $88.20 / $124.95 | $470.40 / 13,200; $846.72 / 26,400; $1,199.52 / 39,600 |
| Enterprise | Agreed individually | Custom | Agreed individually |

Allowances were selected to stay near ETA's prior Creator credit-to-price ratio, not copied from another platform whose model costs differ. The existing 2×/3× bundle discounts remain 10%/15%. Annual billing saves 20% against the corresponding monthly bundle and grants all twelve months of credits upfront. Generation credit charges have not changed.

## Safe rollout

- No database migration or new environment variable is needed.
- `src/config/pricing.json` now describes two self-service products. Versioned **v2** product IDs and lookup keys produce twelve immutable prices, distinct from the old v1 catalog.
- Preview with `npm run billing:setup`; this makes no Stripe calls. Test-mode setup uses the existing documented `--apply` workflow. Live setup requires `--apply --live` and the intended account's server-side key.
- If provisioning through the existing private `stripe-catalog-setup` Trigger task, deploy the updated worker first, inspect the catalog, then use its explicit apply confirmation. Verify `ready: true` and twelve matching v2 prices.
- Only then deploy the website code. Until the new prices exist, the account cards show “Not available yet”; they never fall back to an older, differently priced subscription.
- Existing v1 prices, subscriptions, balances and invoice fulfillment are untouched. Historical promotional invoice validation is retained. New checkouts reject retired campaign links; no new promotion is applied automatically.
- Review Stripe customer-portal plan-change options separately so they do not offer retired plans for new changes.

No Stripe products or prices were created during this redesign. No customer was charged or migrated. [Stripe's price-management documentation](https://docs.stripe.com/products-prices/manage-prices) explains why changed amounts need new Price objects.
