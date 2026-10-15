# Create AI Videos — domain and brand cutover

Prepared October 15, 2026. This document describes required operator actions; it is **not** a claim that cloud settings or production have already been changed. The owner will update Vercel and provider settings after the code work.

## Identity

- Public name: **Create AI Videos**
- Shortcut name: **Create AI**
- Canonical site: **https://createaivideos.app** (no www)
- Confirmed support mailbox: **support@createaivideos.app**
- Logo: `/brand/create-ai-videos-logo.png` (1320 × 256, transparent)
- Square dashboard icon: `/brand/create-ai-videos-icon-1024.png`
- Privacy: `https://createaivideos.app/privacy`
- Terms: `https://createaivideos.app/terms`

Keep the same Supabase database, storage buckets, Meta app, Google projects/OAuth clients, Stripe account/products/prices and Trigger project. Do not rotate secrets or migrate accounts merely to change the public name. Old `framefoundry` billing identifiers and `eta_*` OAuth cookie names intentionally remain internal compatibility identifiers.

## Callback quick reference

Copy these exact values into the named fields; adding a callback to a provider dashboard does not update the corresponding Vercel/Trigger variable automatically.

| Where | Field | Value |
| --- | --- | --- |
| Meta → Facebook Login for Business → Settings | Valid OAuth redirect URIs | `https://createaivideos.app/api/social/facebook/callback` |
| Meta → Facebook Login for Business → Settings | Deauthorize callback URL | `https://createaivideos.app/api/social/facebook/deauthorize` |
| Meta → App settings → Basic | User data deletion → Data deletion callback URL | `https://createaivideos.app/api/social/facebook/deletion` |
| Google Auth Platform → Clients → existing YouTube web client | Authorized redirect URIs | `https://createaivideos.app/api/social/youtube/callback` |
| Supabase → Authentication → URL Configuration | Site URL | `https://createaivideos.app` |
| Supabase → Authentication → URL Configuration | Redirect URLs, entry 1 | `https://createaivideos.app/auth/callback` |
| Supabase → Authentication → URL Configuration | Redirect URLs, entry 2, for callback query parameters | `https://createaivideos.app/auth/callback?**` |
| Stripe Workbench → Webhooks → existing endpoint | Endpoint URL | `https://createaivideos.app/api/webhooks/stripe` |

For **Google account sign-in through Supabase**, keep Google's existing Supabase OAuth callback. The existing `aivideoeditingapp` project API URL was verified as `https://xpvuxuwzztqxzocfquxq.supabase.co`, so its standard hosted callback is `https://xpvuxuwzztqxzocfquxq.supabase.co/auth/v1/callback`. If a custom auth domain is configured, use the exact callback shown by Supabase instead. It is not either social-publishing callback above.

Dashboard entry points:

- [Vercel Production environment variables](https://vercel.com/otherusama-2557s-projects/aivideoeditingapp/settings/environment-variables)
- [Vercel project domains](https://vercel.com/otherusama-2557s-projects/aivideoeditingapp/settings/domains)
- [Existing Meta app settings](https://developers.facebook.com/apps/1068695029206042/settings/basic/)
- [Google OAuth clients](https://console.cloud.google.com/auth/clients) and [consent-screen branding](https://console.cloud.google.com/auth/branding), selecting the existing project
- [Supabase URL configuration](https://supabase.com/dashboard/project/xpvuxuwzztqxzocfquxq/auth/url-configuration) and [Google provider settings](https://supabase.com/dashboard/project/xpvuxuwzztqxzocfquxq/auth/providers) for the existing app project
- [Stripe webhooks](https://dashboard.stripe.com/webhooks), selecting the correct live account
- [Trigger.dev projects](https://cloud.trigger.dev), selecting aivideoeditingapp → Production → Environment variables

If the Vercel project was renamed or moved to a new team, use the project currently serving `createaivideos.app`, not a similarly named replacement. Preserve the existing backend/provider identities.

## 1. Vercel Production

Verify that the project connected to `usamar98/aivideoeditingapp` serves the new domain with valid HTTPS. Add the www alias if you want to support it. Keep the old domains attached and under your control during the transition.

Update these **non-secret** configuration values:

```dotenv
NEXT_PUBLIC_SITE_URL=https://createaivideos.app
NEXT_PUBLIC_SUPPORT_EMAIL=support@createaivideos.app
NEXT_PUBLIC_DEMO_MODE=false
FACEBOOK_REDIRECT_URI=https://createaivideos.app/api/social/facebook/callback
YOUTUBE_REDIRECT_URI=https://createaivideos.app/api/social/youtube/callback
```

Keep Facebook/Google client IDs, App Secrets, token encryption keys, Stripe keys, Supabase keys and Trigger keys unchanged. Do not enable YouTube public publishing just because Facebook was approved. Preserve each publishing flag's appropriate existing value.

Environment edits only apply to a **new deployment**. Deploy the rebrand commit after completing the corresponding provider allowlists below. Rebuild the Trigger worker after changing public text used by its tasks, and set the same Facebook/YouTube callback values and public support/site configuration in Trigger Production where used.

The code maps stale old-domain canonical/checkout settings to the new site defensively, but this is not a substitute for updating the OAuth variables above.

## 2. Meta — reuse the approved, published app

Keep Meta App ID **1068695029206042** and its existing approved permissions. Do not create a replacement app, delete its approvals, rotate its secret, or put it back into Development merely for this migration.

Update the display name and icon to the new branding, App Domains to `createaivideos.app` (plus `www.createaivideos.app` only if used), Website Site URL to the canonical site, contact email to the new support mailbox, and the privacy/terms URLs above.

| Meta setting | Exact new URL |
| --- | --- |
| Valid OAuth redirect URI | `https://createaivideos.app/api/social/facebook/callback` |
| Deauthorization callback | `https://createaivideos.app/api/social/facebook/deauthorize` |
| User data deletion callback | `https://createaivideos.app/api/social/facebook/deletion` |

For deletion, retain the **signed-request callback** configuration, not a generic Facebook homepage. Preserve existing functional legacy callbacks during the brief cutover where Meta permits multiple entries. Check Required actions after metadata edits; comply with any additional review Meta requests. An existing user's Facebook integration can continue to show an older name until Meta applies the branding change.

## 3. Supabase login and Google sign-in

In Supabase Authentication → URL configuration, set Site URL to `https://createaivideos.app`. Add `https://createaivideos.app/auth/callback` and the callback-scoped query pattern `https://createaivideos.app/auth/callback?**` to Redirect URLs. The app includes validated `next`/`provider` parameters and the SDK can add `sb_flow_id`; the callback-scoped pattern supports those without allowing arbitrary domains. Keep legitimate local and existing callback entries during the transition, but do not use an unrestricted production wildcard.

Google sign-in through Supabase still uses the **existing Supabase** Google callback (`https://<existing-project-ref>.supabase.co/auth/v1/callback`) in Google's authorized redirect list. Do not replace that callback with the separate YouTube endpoint. Update Google consent-screen branding, authorized domain, homepage, privacy and terms. Update any configured authorized JavaScript origins that actually use the old website. Check authentication email templates and redirect links for the old brand/domain as well.

Cookies/local browser drafts are origin-bound. Users may need to sign in again on the new domain. Their database accounts, credits, saved projects and subscriptions are not recreated. Do not promise that unsaved browser-only drafts migrate automatically.

## 4. Separate YouTube OAuth client and audit

On the OAuth Web client used for YouTube publishing, add `https://createaivideos.app/api/social/youtube/callback` as an exact authorized redirect URI. Keep its existing client ID/secret. Update the consent branding and domain URLs without adding scopes.

Reply in the existing YouTube audit email thread with the new application name and website, stating that the Google Cloud project and API functionality are unchanged. Provide an updated screencast or reviewer URL if requested. Brand/domain changes can require Google verification updates; the Facebook approval does not approve YouTube. Do not represent pending audit approval as complete.

## 5. Stripe and other provider links

- Update Stripe's customer-facing business name, logo, support email/website and billing portal branding; keep the real legal entity correct.
- Update the **existing** webhook endpoint URL to `https://createaivideos.app/api/webhooks/stripe`. Editing an endpoint URL is different from creating a second endpoint. If you create a new endpoint, its signing secret is different and must be configured securely before use.
- Review hosted checkout/payment links and portal return URLs for the old host. App-created checkout and portal returns use the new brand configuration.
- Do not recreate prices, cancel subscriptions, edit credit allocations or change `metadata.app=framefoundry` / lookup keys. These are fulfillment identities, not public branding.
- Update any manually configured emails, provider dashboards, public social profiles and integration documentation that still link to the old website.

## 6. Redirects, search and discovery

The code provides one-hop permanent (308) redirects from `editingapp.live`, `www.editingapp.live`, and `www.createaivideos.app` to the matching path on `createaivideos.app`. It preserves paths and query strings. The apex canonical host does not redirect to itself.

**API, webhook, auth-callback and Next.js asset endpoints are intentionally excluded** so signed POST requests and in-flight authorization codes are not forwarded across origins. Update provider callbacks explicitly. Do not configure a blanket Vercel domain redirect that overrides these exclusions while providers still use the old callbacks. Existing Vercel redirects can run before the application; inspect them separately.

Keep old hosts working for the migration period (Google recommends retaining redirects for at least a year). Preserve external verification files/DNS records when required. Then:

1. Verify old and new properties in Google Search Console and Bing Webmaster Tools. Use the correct new verification value if using an HTML tag; DNS verification doesn't need the public meta variable.
2. After the new site and old redirects work, submit Search Console's Change of Address for the old domain.
3. Submit `https://createaivideos.app/sitemap.xml` and inspect representative homepage/feature URLs.
4. Verify public production pages have self-referencing new-domain canonicals and are not marked noindex. Studio, auth, API and preview pages must remain non-indexable.
5. Check Open Graph previews, favicon, manifest, `robots.txt` and `llms.txt`. Temporary search-result branding/ranking fluctuations during recrawling are possible.

Reference: [Google's site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## 7. Acceptance checks after deployment

- Open the apex and www variant; verify HTTPS, the new logo/name and the support email.
- Follow an old public feature URL with a query string; confirm one redirect to the corresponding new page, not the homepage.
- Sign in with an existing account; confirm unchanged project and credit balances.
- Connect a Facebook Page using a user without a Meta app role. If you choose to test publishing, use authorized test content and remember Facebook Reels are public.
- Connect YouTube and verify its approved/private-only behavior without bypassing audit restrictions.
- Verify checkout return URLs and existing signed webhook handling without charging a real customer for a test.
- Read-only SEO smoke check: `node scripts/check-seo.mjs https://createaivideos.app --production`.

Automated local tests use fixtures; they do not post a Reel, upload to YouTube, charge Stripe or prove that cloud dashboard settings have been saved.

## Local verification — October 15, 2026

- Production build, TypeScript and scoped application/worker/test lint passed.
- Automated suite: **975 passed, 2 optional tests skipped**.
- Development and production HTTP checks passed for **17 public pages**, **17 sitemap entries** and **9 PNG social previews**. Canonicals, metadata, structured data, support links, preview noindex and production indexing were checked.
- **19 local Host-header requests** verified alias redirects preserve paths/query strings, the apex does not loop, and API/auth/Next.js endpoints are excluded.
- Homepage branding checked at 360px and 1280px without horizontal overflow.

These checks use local fixture-backed servers and were recorded before the main-branch push. A Git push is not proof of a successful production deployment; provider-dashboard changes and live acceptance checks remain with the owner.
