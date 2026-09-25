# ETA SEO and AI-search action plan

Prepared: **2026-09-25**. This is a release and measurement checklist, not a promise of ranking or completion of owner-controlled tasks.

Read the [full audit](./FULL-AUDIT-REPORT.md) for evidence, the [Search Console setup guide](./SEARCH-CONSOLE-SETUP.md) for verification/submission instructions, and the [GEO analysis](./GEO-ANALYSIS.md) for crawler and AI-search limitations.

## 1. Validate the local release before publishing

**Owner: implementation team. Status: implementation present; final results to be recorded.**

- Run the type checker, lint, automated tests and production build. Record exact commands, results and any unresolved failures rather than treating source presence as a pass.
- Test the publication repository's draft, unavailable, retired, malformed and provider-error cases. Hidden features must not reappear from static fallback in pages, metadata, related links, sitemap or llms.txt.
- Inspect all nine intended public pages in initial HTML. Confirm unique descriptive titles, intended canonicals, readable descriptions, correct links and truthful structured data.
- Check the homepage and representative feature, pricing, comparison and contact pages at desktop and mobile sizes. Ensure the comparison/pricing tables scroll within their containers and essential content remains available without JavaScript.
- Inspect `/robots.txt`, `/sitemap.xml`, `/llms.txt` and social-card responses. Ensure discovery files contain no localhost/preview origin, accidental doubled path slash, private URL or draft feature.
- Confirm login, bare and nested studio/admin/API/auth routes receive the intended noindex treatment. Test preview/demo builds separately from Production. Preserve application authentication; robots.txt is not access control.
- Confirm public support links display `support@editingapp.live` and that all visible branding and social images use ETA.

Current expected public sitemap paths:

```text
/
/features
/features/faceless-video-generator
/features/ai-cartoon-series
/pricing
/guides
/guides/faceless-videos-vs-ai-cartoons
/about
/contact
```

Additional genuinely published features may increase the list. Unreleased features, private projects and signed downloads must not.

## 2. Confirm Production configuration and deploy deliberately

**Owner: site owner/deployer. Status: not established by local source review.**

Check the intended Vercel Production project and configuration before deployment:

```dotenv
NEXT_PUBLIC_SITE_URL=https://www.editingapp.live
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPPORT_EMAIL=support@editingapp.live
```

Optional HTML-tag verification values must be real values from the correct property:

- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`: only Google's issued HTML-tag `content` value. A Domain-property DNS TXT record belongs at the DNS provider, not here.
- `NEXT_PUBLIC_BING_SITE_VERIFICATION`: only Bing's issued `msvalidate.01` meta-tag content when that method is chosen. If an existing method or approved Google import already verifies the site, do not invent another value.

These are public verification identifiers, not Google/Bing API keys. Never put private service credentials in `NEXT_PUBLIC_` variables. Changes to build-time public values require a new deployment.

After deployment, inspect fresh responses from `https://www.editingapp.live`, not just localhost or a preview. Check both host variants and preserve the chosen canonical host. Confirm each sitemap URL is usable, that the generated canonical uses the intended origin, and that public pages do not accidentally inherit preview noindex headers.

Also verify the configured feature catalog can be read successfully. The new publication logic intentionally does not hide database errors by serving potentially retired static content. Resolve configuration/permissions if a valid catalog cannot load; do not restore unsafe fallback simply to silence an error.

## 3. Verify ownership and submit discovery files

**Owner: site owner with Google/Bing access. Status: not performed in this audit.**

Follow [SEARCH-CONSOLE-SETUP.md](./SEARCH-CONSOLE-SETUP.md). First check whether the correct property already has a verified owner. Use DNS verification for a Google Domain property, or the offered HTML-tag method for the intended URL-prefix property. Complete Bing verification or an explicitly approved import of the verified Google property.

Submit only this canonical sitemap in the respective Sitemaps tools:

```text
https://www.editingapp.live/sitemap.xml
```

Robots.txt and llms.txt are not sitemap submissions. Source code, database files, API keys and private application URLs do not belong in Search Console. A sitemap aids discovery, not guaranteed indexing. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

Inspect the homepage, both feature pages, pricing and the workflow guide. Record the live-test outcome, declared canonical, selected canonical when available, index status and any actionable exclusion. A page blocked intentionally because it is private is not an SEO defect.

Review applicable AI-search inclusion settings and reports using the current Google instructions linked in the setup guide. Do not weaken account security or enable training permissions merely to chase search visibility.

## 4. Supply the trust information only the owner can approve

**Owner: business owner, with appropriate policy/legal review. Status: awaiting verified details.**

- Confirm the actual operator/business name and appropriate public contact information. Add a business address only if real, approved and applicable; never invent one for schema.
- Provide reviewed privacy and terms documents covering the actual AI processors, uploaded/generated media handling, retention/deletion process, account use, subscriptions, renewal/cancellation, payment disputes and content rights.
- Distinguish restoration of reserved generation credits from refunding a subscription payment. Do not promise a refund window, tax treatment, unlimited rights or deletion timing until policy and implementation support it.
- Confirm the support mailbox works. Set response expectations only after establishing a real support process.
- Supply genuine official profile URLs before adding `sameAs` links. Publish customer quotes, logos or usage statistics only with evidence and permission.

The present about/contact content explains the product but does not complete these legal and operator requirements. This audit does not draft binding policies or certify compliance.

## 5. Add first-hand product evidence

**Owner: product owner/editor. Status: public verified samples still needed.**

Create a small, honest example set rather than a large repetitive page library:

1. One faceless video showing its prompt or supplied script, reviewed storyboard and final MP4.
2. One short cartoon showing permitted reference art or an original prompt, approved cast, edited scene plan and final animation.
3. A brief note for each example listing the actual model/workflow, date, edits, limitations and observed generation time. Show imperfections that matter to a purchaser rather than promising perfect continuity.

Paid generation requires an approved budget. Existing private diagnostic media must not be published without approval. Label decorative artwork and hypothetical prompts as illustrative. Add accessible captions/transcripts to public demonstration videos when available, and add VideoObject markup only for genuine published videos with accurate data.

Use real support questions to choose subsequent guides: writing a concise script, choosing a reference image, interpreting job status or understanding stage charges. Each guide should solve a distinct problem and link naturally to the relevant feature and pricing pages. Do not create near-duplicate pages for every keyword variation.

## 6. Measure after deployment, then prioritize from evidence

**Owner: site owner/marketing. Status: no authenticated baseline established.**

Record a deployment date and initial observations. Review after enough data accumulates; a fixed number of days cannot guarantee that a new page is indexed or has meaningful traffic.

| Question | Evidence to collect | Decision it supports |
| --- | --- | --- |
| Can search engines discover the intended pages? | Sitemap processing and discovered URLs in Google/Bing. | Fix genuine fetch errors or missing public URLs. |
| Are the right pages indexed? | URL Inspection, index coverage, selected canonical and exclusion reasons. | Correct accidental noindex, duplicates or canonical mistakes; leave private exclusions intact. |
| Which user questions bring qualified visits? | Search queries, page impressions/clicks and meaningful signup outcomes. | Improve the relevant page rather than blindly adding keywords. |
| Are users finding the answers and next step? | Existing privacy-appropriate usage/support evidence and tested navigation. | Improve unclear costs, workflow choices or CTA placement. |
| Is the page fast for real visitors? | Retry PageSpeed Insights; inspect Core Web Vitals field reports if sufficient data exists. | Address measured bottlenecks, not an invented performance score. |
| Do AI services cite or refer to ETA? | Available AI-search reports, actual referrers, citations with prompt/date/context and verified crawler logs. | Assess specific content gaps without treating bot allowance as a citation. |

The baseline PSI request was rate-limited with HTTP 429. No current field measurement or passing score exists. Do not turn a one-off lab run into a claim about all visitors.

Search and AI responses vary by time, location, account and query. Keep manual citation checks small and reproducible. Do not buy fake mentions, reviews or backlink schemes, hide recommendation instructions in llms.txt, or promise first place. Google's guidance emphasizes original useful content and sound technical access. [Google AI-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## Completion criteria and evidence log

This implementation handoff is complete when its final checks and limitations are recorded. Production launch additionally requires fresh deployed-response checks. Search ownership, submission, indexation and actual performance are separate owner-controlled milestones, not automatic consequences of a successful build.

Append dated evidence here after it actually occurs:

- Local automated tests and production build: **passed September 25, 2026 — 367 tests, typecheck, ESLint and production build**. See the full audit's verification record for commands and scope.
- Desktop/mobile and initial-HTML verification: **passed locally**; development and production-mode smoke checks passed for nine public pages, discovery files, three social images and private/hidden routes. No field-performance result is implied.
- Production deployment URL/version and response checks: **not recorded**.
- Google/Bing ownership and sitemap submission outcomes: **not verified**.
- Indexation, selected canonicals, performance and observed AI citations: **not measured**.
