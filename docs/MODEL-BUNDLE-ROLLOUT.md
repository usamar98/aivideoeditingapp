# Model menus and discounted credit bundles

## Rollout order

1. Run `supabase/migrations/20260926100154_cartoon_direct_models.sql` in Supabase SQL Editor, after the existing migrations. It only replaces two cartoon reservation/settlement functions. It does not grant credits, alter existing reservations, or change subscriptions.
2. Deploy the updated Trigger worker, including `cartoon-pipeline` and `stripe-catalog-setup`, before publishing the website.
3. Create missing Stripe bundle prices using the server-only catalog setup described in `DEPLOYMENT.md`. Inspect first, apply only after operator approval, and confirm all 18 prices are ready. Six existing base prices are reused; twelve discounted bundle prices are added. No customer is charged by catalog creation.
4. Publish the website. Verify each tier/interval/bundle in Stripe test mode: amount, quantity 1, full credit metadata, paid-invoice fulfillment exactly once, and annual upfront allocation.
5. Run a separately approved, budget-capped provider test for any model before offering it to customers. Mocked worker tests verify routing and accounting but cannot prove account access, output quality or live provider availability.

## Configuration

No new API credentials are required. The worker uses the existing `FAL_KEY`, Supabase credentials and Trigger setup. Both Seedance variants retain the existing `CARTOON_SEEDANCE_ENABLED=true` web-server opt-in; enable it only after verifying the account has access.

## Model compatibility

- Character-reference workflow: Kling O3 Pro and Seedance 2.5 reference-to-video; existing projects and rates are preserved.
- Direct-prompt workflow: MiniMax H3 Max Turbo, Seedance 2.5 text-to-video and Kling V3 Pro. Story planning is 2 credits. These endpoints do not accept character uploads and do not generate portraits or scene images.
- Model-specific resolution choices are validated on the server and in the database. MiniMax receives uppercase resolution values and a numeric duration; Seedance and Kling receive exact string durations. Automatic/unknown durations and prompt expansion are not used.
- Kling V3 Pro offers generated audio or silent output; its source resolution is provider-managed and the app exports 720p. MiniMax and Seedance exports preserve the selected supported resolution.
- These text-to-video models do not replace faceless still-image narration, UGC lip-sync or uploaded-podcast editing. Do not expose incompatible endpoints in those tools.
- Future models need an allowlisted endpoint, validated input options, worker mapping and credit rules in both the application and a new SQL migration. Never allow arbitrary client endpoint URLs or client-supplied credit amounts.

## Accounting and verification

The supplied direct-video models use a credit-only rate table, rounded upward against the least expensive discounted credit bundle and the approved 1.5× target. No raw provider price table is stored or displayed. This is not a guarantee of net profit: planner calls, retries, refunds, storage, compute and payment fees still incur costs.

Bundle pricing uses integer cents, grants full credits and leaves existing subscription prices untouched. No new price-ID environment variables or coupons are needed. For already-subscribed customers, configure approved plan switches in Stripe's portal, keep quantity changes disabled, and prefer changes at renewal to avoid duplicate allocations.

Local tests cover SQL permissions/ownership, matching UI/backend costs, failed/cancelled refunds, late worker fencing, image-free worker branches, provider input contracts, bundle-price validation, duplicate checkout prevention and catalog idempotency. Live rollout and paid tests require separate authorization.
