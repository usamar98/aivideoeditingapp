# Create AI Videos new domain SEO review

Reviewed October 16, 2026. Canonical origin: **https://createaivideos.app**. Product: an AI video creation SaaS with eight published workflows.

The new-domain foundation is working: the fresh production baseline passed checks for 17 public pages, 17 sitemap URLs and nine social images. This release adds one useful video-creation guide, improves navigation and product explanations, and keeps publication, canonical and private-page safeguards intact. Final deployment acceptance is recorded below.

## Improvements in this release

- Added a practical guide to choosing a workflow, writing a brief, reviewing credit charges and checking an AI video before export. It links to actual tools rather than creating repetitive keyword pages.
- Replaced homepage prompt shortcuts with descriptive public-feature links. Unpublished tools cannot reappear through those shortcuts.
- Updated the homepage, feature directory and answers to cover real estate tours, Ad Remake and other current workflows. Removed outdated statements that publishing must happen outside the app; supported exports still require a separate account authorization and explicit confirmation.
- Added article-specific Open Graph metadata. Aligned visible guide updates, Article dates and sitemap dates. Feature sitemap dates now reflect a newer public editorial update without replacing a newer CMS date.
- Kept one Organization and WebSite identity, **Create AI Videos**, with new-domain URLs and the approved logo. No invented ratings, reviews, author credentials, FAQ rich-result promises or hidden AI recommendation instructions were added.
- Expanded the optional public AI directory with accurate boundaries for films, property tours, Ad Remake and photo presenters. It is not a Google ranking requirement or a sitemap replacement.
- Added repeatable SEO checks and a live-sitemap export for the Google handoff. The release target is 18 public URLs, with private projects, account routes and previews excluded.
- Increased the primary studio button's touch target to 44px. The baseline mobile check at 390 × 844 showed a visible H1 and primary CTA without document-wide horizontal overflow.

## Domain migration checks

Fresh HTTPS checks returned permanent **308** redirects preserving `/` and `/features/ai-short-film-generator`:

| Source | Destination |
| --- | --- |
| `www.editingapp.live` | `createaivideos.app` at the same path |
| `editingapp.live` | `www.editingapp.live`, then `createaivideos.app` at the same path |
| `www.createaivideos.app` | `createaivideos.app` at the same path |

The old apex currently takes two hops. Reducing that to one hop is an optional owner-controlled domain setting improvement; these code changes do not alter provider callbacks or webhook routing. Retain old-domain ownership and redirects for at least a year. Use Change of Address for applicable old-domain variants after Google verifies both properties. [Google migration guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

Public production pages have self-referencing new-domain canonicals. Robots advertises the canonical sitemap, private paths retain noindex headers and authentication, and preview/demo environments remain excluded. Dynamic sitemap and feature publication checks still fail rather than resurrecting retired content when the authoritative catalog is unavailable.

## Evidence and limits

| Check | Result |
| --- | --- |
| Fresh production baseline | Passed 17 public pages, distinct metadata, one H1 per page, JSON-LD parsing, sitemap, robots, optional AI directory, social images, private noindex and hidden-page 404 checks |
| Alias migration probes | Permanent path-preserving redirects observed for homepage and representative feature |
| Source specialist review | Technical/sitemap, content/search experience, schema and AI-discovery review; no additional blocking canonical or schema defect identified |
| Mobile baseline | Visible heading and CTA; no document-wide horizontal overflow at 390px |
| Google Search Console, GA4 and CrUX | No configured Google SEO credentials; index coverage, selected canonicals, impressions and real-user Core Web Vitals were not measured |
| PageSpeed mobile and desktop | API returned HTTP 429 quota errors; no Lighthouse score, inferred INP or fabricated performance pass is reported |
| Rankings and third-party citations | Not established; technical eligibility and helpful content do not guarantee placement |

No overall numeric score is assigned because performance and authenticated search outcomes are unmeasured. The September audit/cache described the retired domain and was not reused as current production evidence.

## Owner actions after deployment

1. Open [Search Console](https://search.google.com/search-console), select the verified `createaivideos.app` property and submit **https://createaivideos.app/sitemap.xml**. Keep the working DNS TXT record; an additional HTML ownership file is unnecessary if already verified.
2. Complete the old-domain Change of Address steps and monitor old/new properties. Inspect the homepage, key features and new guide, then investigate genuine exclusion reasons rather than repeatedly requesting indexing.
3. Provide approved real business/operator details, official profile links and authorized examples from actual product use. Do not portray stock concepts as app-generated customer results or buy fake reviews/backlinks.
4. Retry PageSpeed when quota permits and use real-user reports when enough data exists. No analytics or training-permission settings were changed in this release.

The [Search Console setup guide](./SEARCH-CONSOLE-SETUP.md) contains all public URLs, exact Google links, ownership-file placement and the separate OAuth branding links. No new database migration, worker credential or provider API key is required.

## Deployment acceptance

Pre-release checks passed: 1,023 tests (two intentionally skipped), TypeScript, scoped lint and the production Turbopack build. The local production HTTP check passed all 18 public pages, 18 sitemap entries, 18 linked public paths and nine PNG social previews, including private-page noindex and hidden-page 404 checks. The new guide rendered at 390px without document-wide horizontal overflow; its primary studio link is 44px high.

After release, require Vercel **Ready** on the pushed commit and run `npm run seo:check` against the canonical domain, then `npm run seo:export` to generate the handoff from the live sitemap. A successful build or deployment does not submit a sitemap, publish Google consent-screen branding or guarantee indexing. Authenticated Google search outcomes and real-user performance remain unmeasured.
