# ETA SEO, answer-engine and AI-search audit

Audit date: **2026-09-25**. Intended production origin: **https://www.editingapp.live**.

## Executive conclusion

The existing video app is accessible in meaningful server-rendered HTML. It is not an empty JavaScript shell, and the audit did not establish a DNS problem. The main gaps are malformed discovery URLs, inconsistent branding, incomplete public explanations and trust information, and a feature-publication fallback that could reintroduce hidden content.

The local working tree now contains corrections and new public content. **Source changes are not proof of deployment, indexing, ranking, rich results, or AI citations.** Final test results and production acceptance checks must be recorded separately below. SEO, AEO and AI-search work can improve access and usefulness; it cannot make a search engine or AI platform prefer ETA at the top.

Use this report alongside the [action plan](./ACTION-PLAN.md), [Search Console setup guide](./SEARCH-CONSOLE-SETUP.md) and [GEO analysis](./GEO-ANALYSIS.md).

## Scope and evidence

- Read-only source review of public routes, metadata, structured data, crawl controls, pricing, workflow limits, feature publication and internal links.
- Fresh unauthenticated production requests for the homepage, feature directory, two feature pages and discovery files. The homepage returned HTTP 200 and approximately 535 visible-text words before JavaScript execution.
- Source-verified faceless/cartoon capabilities and credit charges, used to prepare specific public answers instead of generic keyword filler.
- Search-result sampling for faceless and cartoon generation intent. This was directional research, not a reproducible Google rank or search-volume dataset.
- Existing local ETA branding changes were preserved. The owner confirmed `support@editingapp.live` as the public support email.

The audit did **not** authenticate to Google Search Console or Bing Webmaster Tools, inspect private user projects, alter DNS, submit a sitemap, purchase paid visibility data, or run a paid generation. Search Console ownership, index coverage, selected canonicals, manual actions, traffic and actual AI citations remain unverified. PageSpeed Insights encountered HTTP 429; no Lighthouse score or Core Web Vitals field pass is claimed.

### Fresh response versus search cache

A search tool returned a cached photo-editing homepage with a different tool catalog. A fresh HTTP request returned the expected faceless/cartoon video app, titled `EditingApp — Your AI video creation studio`. The cached snapshot is not evidence that the current domain points to the wrong service. After deployment, use fresh responses and URL Inspection to investigate what crawlers see; do not change DNS on the basis of that snapshot.

## Production baseline and local response

| Area | Observed baseline or source risk | Local implementation present at review | Still required |
| --- | --- | --- | --- |
| Public HTML | Home and the three public feature routes return useful initial HTML. | Public descriptions, workflow steps, limitations and answers continue to render as page content. | Verify built and deployed HTML, including without client JavaScript. |
| Canonical origin | Discovery links contain accidental double path slashes: robots advertises `//sitemap.xml`; sitemap includes `//features`. | Shared URL normalization and absolute-URL construction use the intended `www` origin. | Check Production environment values, redirect behavior, rendered canonicals and fresh discovery responses. |
| Branding | Production still displays EditingApp; local design uses ETA. | ETA identity, logo, favicon, page metadata and social-image integration are present. | Deploy consistently and inspect actual share previews; external caches may update later. |
| Crawl controls | Public crawling is permitted. Private disallow entries end in `/`, missing bare-root coverage. Login/private HTML uses noindex in parts of the app, but broad response-header coverage is missing. | Shared private-root rules, private-route `X-Robots-Tag`, admin metadata and preview/demo noindex behavior are present. Login remains crawlable with noindex. | Test root and nested routes, redirects, metadata and headers in a production build and preview deployment. |
| Publication safety | Old repository fallback could restore a built-in feature when a CMS draft, retirement or unavailable state was hidden by anonymous reads. It could also silently substitute static content after a catalog error. | Authoritative server reads respect stored overrides; hidden/malformed overrides suppress the built-in. Public reads do not infer hidden records. Failed or incomplete reads fail instead of resurrecting content. Regression tests are added. | Execute tests, confirm expected database permissions/configuration, and test publication changes across page, metadata, related links and sitemap. |
| Discovery coverage | Public pricing, guides, about and contact routes were absent; `/llms.txt` returned 404. | Dynamic sitemap includes approved public pages and published features. Optional llms.txt lists public facts and links. | Check public-only output after deployment. Nine sitemap URLs are expected for the current catalog; later published features can expand it. |
| Page intent and linking | Homepage headings are expressive but vague in isolation. Tool cards lead directly into studio flows. Feature-directory copy describes internal publishing mechanics. | Descriptive product context, public feature links, shared navigation, pricing, a comparison guide and support pages are present. | Verify links and mobile navigation; preserve a clear creation CTA without hiding explanations behind sign-in. |
| Answers | Features list capabilities and limitations, but offer little practical decision support or visible FAQ content. | Shared answer-first FAQs, steps, use cases and a faceless/cartoon comparison use verified product facts. | Editorial review against future product changes and actual user support questions. |
| Entity and social markup | Feature SoftwareApplication/breadcrumb markup exists; the homepage lacks a connected organization/site graph. | Organization/WebSite identity, page/breadcrumb markup, pricing offers, guide Article markup and social images are present. | Validate generated JSON-LD against visible content and inspect social-card routes. No rich-result eligibility or display is promised. |
| Trust | Contact fallback can expose `support@example.com`; no complete public operator/legal package is established. | Confirmed support email and useful about/contact content are present. | Owner-approved operator identity, privacy/terms/billing policies and genuine evidence remain outstanding. |

Robots.txt is not a security boundary. Authentication and authorization must continue protecting accounts, uploads, job details and signed media. A robots-blocked page cannot be crawled to read its noindex rule. The local approach keeps private paths protected and gives the public login page an explicit indexing exclusion. [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## Content quality and search experience

### What is already sound

The source distinguishes actual workflows from roadmap ideas. Faceless output is narrated AI still imagery, not generated moving footage. Cartoon output is a finished video, not an editable rig. Existing artwork is labeled illustrative. Pricing distinguishes monthly payments from annual payments and full-year credits issued upfront. These details are valuable purchasing information and should remain visible.

### What the local content adds

- A visitor can compare narration-led videos with character-led animation before opening the studio.
- Feature pages explain inputs, review steps, formats, duration choices, languages, credit stages and limitations.
- FAQs state that cancellation of running work may require worker confirmation. Generation-credit returns are not represented as refunds of subscription payments.
- The comparison guide offers concrete brief examples and a review checklist, without presenting hypothetical prompts as completed output.
- Pricing derives amounts from the existing catalog; cartoon examples use the existing credit/model constants where available.
- About and contact pages explain the product and support process without inventing a founder biography, street address, security certification or response-time commitment.

This is substantive product guidance, not a mandate to reach a word count. The approximately 535-word baseline homepage was not automatically deficient because of its length. A mechanical readability result was distorted by navigation, prices and fragments; it is not used as a ranking score.

### E-E-A-T assessment: evidence, not a numerical health score

| Dimension | Evidence and remaining gap |
| --- | --- |
| Experience | Source-specific workflow explanations exist. Real public generation demonstrations with an honest method and limitations are still needed. Decorative artwork does not prove output quality. |
| Expertise | Copy can be checked against actual configuration and generation stages. Keep model availability, costs and limitations current; do not claim universal model superiority. |
| Authority | Independent mentions, verified profiles, customer evidence and relevant citations were not established. Do not fabricate reviews, awards, usage counts or `sameAs` URLs. |
| Trust | Real support contact, clear pricing and limitations help. Verified operator details and approved privacy/terms/payment policies remain owner-dependent. |

No aggregate SEO health, E-E-A-T or AI-citation score is assigned because authority, indexing, performance and external evidence are incomplete.

### Search-intent findings

Directional sampling of pages from PhotoGrid, Fotor, Canvasvid, CapCut and RunTitan indicates that people searching for these generators need a workflow/tool explanation, examples, constraints, price context and a clear creation path. ETA's existing product/feature pages are a suitable foundation. A large generic blog library is not the first priority.

The sample did not establish exact Google positions, query volumes, ads, People Also Ask coverage or AI Overview citations. Do not treat it as a quantified competitor ranking report. First publish the two genuinely different workflow pages and one helpful comparison; add further guides only when they solve a distinct supported user problem.

## AEO and AI-search boundaries

The same public facts should be understandable by people, search crawlers and answer systems. Concise definitions, clear tables, truthful limitations and original examples are useful. There is no special hidden instruction that makes an AI recommend this site. Google's current guidance prioritizes useful original content and normal technical SEO rather than special AI files, arbitrary answer lengths or scaled query-variant pages. [Google AI-search optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

The new llms.txt is an optional navigation aid, not a ranking signal, crawler permission file or sitemap substitute. Public search-crawler access and foundation-model training permission are different owner decisions; see the [platform-specific GEO analysis](./GEO-ANALYSIS.md). No training-license or RSL policy is invented by this change.

Structured data must describe the visible site accurately. It cannot replace missing business evidence, genuine video samples or accurate prices. Do not add fabricated ratings, nonexistent VideoObjects or FAQ-rich-result promises. [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

## Owner-dependent work still open

1. **Operator and policies:** approve the real operator/business identity, contact details and applicable privacy, retention, deletion, subscription, cancellation, payment-refund and usage-rights terms. Publish reviewed policies and link them from signup, billing and public navigation as appropriate. The current about page is not a legal-policy substitute.
2. **Genuine product examples:** approve a controlled generation budget and permission to publish selected outputs. Document the prompt, workflow, model, date, edits, limitations and approximate generation time actually observed. Do not expose private user assets or imply a decorative sample is a customer result.
3. **Search ownership:** verify the correct Google and Bing properties using their real issued values or existing valid verification. No API key, invented token or generic verification file should be submitted. Follow the [setup guide](./SEARCH-CONSOLE-SETUP.md).
4. **Deployment and measurement:** publish only after tests and review. Inspect actual responses, then submit the canonical sitemap, inspect priority pages and gather search/AI performance evidence over time.
5. **Performance:** retry PageSpeed Insights when the rate limit clears. Check real-user Core Web Vitals when a sufficient field sample exists. Absence of data is not a passing result.

## Verification record

Source review and local file presence are recorded above. Final automated test, browser, build and production acceptance results must be appended by the implementation owner. At the time this report was written, no claim is made that this SEO change was deployed, a sitemap was submitted, or a search/AI platform indexed the new content.

### Completed local verification — September 25, 2026

- `npm run check` passed with production build settings (`NEXT_PUBLIC_DEMO_MODE=false`, `VERCEL_ENV=production`): typecheck, ESLint, **367 tests across 29 files**, and the optimized Next.js build.
- Of those tests, 20 cover authoritative feature publication and 101 cover SEO contracts (canonical origins, metadata, preview rules, discovery, exact prices, JSON-LD safety and media paths).
- `node scripts/check-seo.mjs http://localhost:3001` passed for development/noindex behavior.
- `node scripts/check-seo.mjs http://localhost:3002 --production` passed against the local production build: nine public HTTP 200 pages; distinct branded titles/descriptions; intended canonicals; one H1 each; parseable entity/page JSON-LD; three working PNG social cards; nine public-only sitemap entries; robots and llms responses; private noindex headers; no login canonical inheritance; hidden/unknown feature and hidden social-image HTTP 404s.
- Browser checks used 1440×1000 desktop and 390×844 mobile viewports. Homepage, cartoon feature, pricing, guide and contact pages rendered; no framework error overlay was observed. Checked page bounds did not overflow; the guide table scrolled inside its container. Yearly pricing displayed $239.88 / $359.88 / $959.88 annual charges and 5,280 / 13,200 / 26,400 upfront credits. No checkout was initiated.
- The ETA social card was visually inspected. Screenshots are local ignored `seo-*-verification.png` artifacts, not production evidence.
- Existing operational billing return URLs were preserved separately from normalized SEO canonicals; no Stripe settings, subscriptions, jobs, credits or database records were changed.
- `git diff --check` passed. A sandbox process-spawn restriction required rerunning the checks with approval; the subsequent complete run passed.

These checks are not a Google Rich Results Test, production deployment verification, Search Console submission or Core Web Vitals measurement. The live domain remains unchanged by this task. Follow the owner/deployment steps before evaluating indexing or traffic.
