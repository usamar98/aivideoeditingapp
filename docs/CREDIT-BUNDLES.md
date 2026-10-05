# Credit selectors and subscription bundles

Creator and Growth each offer an accessible slider and three credit pills. Enterprise has a custom allowance agreed through Contact. The current prices and rollout instructions are in [Pricing v2](PRICING-V2.md).

| Plan | Monthly credit options | Monthly payment options |
| --- | --- | --- |
| Creator | 200 / 400 / 600 | $9 / $16.20 / $22.95 |
| Growth | 1,100 / 2,200 / 3,300 | $49 / $88.20 / $124.95 |

The 2× bundle saves 10%; the 3× bundle saves 15% against multiplying the base price. Annual billing saves another 20% against the corresponding monthly bundle. It charges once per year and issues twelve months of credits upfront, not monthly refills. Prices are USD before applicable checkout taxes.

## Safeguards

- Marketing links preserve plan, interval and bundle through sign-in to billing.
- Server actions accept only bundles 1, 2 or 3, authenticate the account and match the immutable Stripe price against the current catalog. Browser-provided amounts or credit totals are not trusted.
- Each v2 price already contains the complete bundle; Stripe Checkout quantity is **1**. Open checkout reuse must match the selected price and bundle. Existing subscribers use Manage subscription instead of starting a duplicate subscription.
- Signed paid-invoice fulfillment remains transactional and idempotent. Historical quantity-based subscriptions and previously purchased promotional invoices remain supported; old promotions cannot start new checkouts.
- Existing subscriptions, credits and prices are not migrated or changed automatically.

## Deployment

Provision the twelve new v2 prices before deploying the redesigned website. Until matching prices exist, checkout is disabled for those selections. No database migration or new environment variable is required. The Stripe webhook and customer portal still need their existing configuration. This local redesign did not create live prices, charge customers or change balances.
