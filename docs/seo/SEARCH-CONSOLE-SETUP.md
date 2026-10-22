# Create AI Videos search-engine setup and owner handoff

Updated: 2026-10-22. Production website: `https://createaivideos.app`.

Owner-account Search Console checks on October 22, 2026 confirmed verified ownership of `createaivideos.app` and `editingapp.live`. The canonical sitemap was resubmitted successfully after the production release passed its 20-page SEO checks. No Bing property was inspected.

## Verified release and migration status

- Production serves the requested homepage title and H1, a separate slogan, twelve descriptive hero image alts and FAQ JSON-LD matching the eight visible answers. The live sitemap contains 20 public URLs, including four guides.
- `http://createaivideos.app/` already redirects permanently to HTTPS; direct checks passed for 14 HTTP, www and retired-domain path/query combinations. No domain, DNS or email settings were changed.
- Google accepted `https://createaivideos.app/sitemap.xml` on October 22, 2026. Its report still showed the previous October 21 read and 18 discovered pages immediately afterward. The live count of 20 does not mean Google has indexed all 20.
- Change of Address for `https://www.editingapp.live/` to the `createaivideos.app` Domain property passed Google's checks and was confirmed. Search Console shows **This site is currently moving**, started October 22, 2026. Do not cancel or submit that same move again.
- The separate `editingapp.live` Domain-property precheck initially reported **Couldn't fetch the page** for `http://editingapp.live/`, while direct public checks passed. A later Google recheck passed without DNS or routing changes. That move was also confirmed: Search Console shows **This site is currently moving** to `createaivideos.app`, started October 22, 2026. Neither move should be cancelled or submitted again.

These observations establish deployment and submission status, not completed indexing, transferred rankings or a guaranteed migration deadline.

## Start with these Google links

| Purpose | Exact link or value |
| --- | --- |
| Search Console | [Open Google Search Console](https://search.google.com/search-console) |
| Property to select | Domain `createaivideos.app` (recommended) or URL prefix `https://createaivideos.app/` |
| Sitemaps for the Domain property | [Open Sitemaps](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Acreateaivideos.app) |
| Sitemap to submit | `https://createaivideos.app/sitemap.xml` |
| Structured-data testing | [Google Rich Results Test](https://search.google.com/test/rich-results) |
| Speed testing | [PageSpeed Insights](https://pagespeed.web.dev/) |

If the Sitemaps link does not select your property, choose `createaivideos.app` in the property selector first. The owner previously reported successful DNS verification: if this property already says **Verified owner**, keep that TXT record and do not add a second verification method.

Search Console is not Google Cloud OAuth branding or the YouTube API review. For the consent screen, use [Google Auth Platform branding](https://console.cloud.google.com/auth/branding?project=antigrivity-491910), select the existing project, and use app name **Create AI Videos**, homepage `https://createaivideos.app/`, privacy `https://createaivideos.app/privacy`, terms `https://createaivideos.app/terms`, authorized domain `createaivideos.app`, and the [approved 120px PNG](https://createaivideos.app/brand/create-ai-videos-oauth-120.png). A website deployment does not publish Google's new consent-screen branding.

## 1. If Ownership verification gives you no code

First check the selected property and its status. **No new code is needed if it already says you are a verified owner.** Existing DNS verification, inherited verification, or an automatic method may explain this. Keep the existing verification in place.

If unverified, choose one route:

| Property | Method | Where the provided value belongs |
| --- | --- | --- |
| Domain: `createaivideos.app` | DNS verification | Add Google's exact TXT record at your authoritative DNS provider; follow its root-host instructions. Do not put the TXT record in an app environment variable. |
| URL prefix: `https://createaivideos.app/` | HTML tag | Expand the HTML-tag method. Put only the tag's `content` value into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, deploy, then verify. |
| URL prefix: `https://createaivideos.app/` | HTML file | Download Google's exact `google….html` file and place it unchanged in `public/`. Deploy and confirm `https://createaivideos.app/<exact-filename>.html` returns the original file without sign-in. |

A Domain property uses DNS verification, not an HTML meta tag. The URL-prefix option is suitable when using this app's metadata integration. Never invent a token or copy a sample as your real value. [Google ownership-verification instructions](https://support.google.com/webmasters/answer/9008080)

No HTML verification file is required when DNS verification already works. Google issues that account-specific file; this project cannot generate a substitute. Do not rename the downloaded file, invent its token, or replace your working TXT record. No Google API key is required to use Search Console manually.

If still stuck, share a screenshot showing the selected property and Ownership verification panel. Hide personal account details; there is no need to share credentials. Do not change DNS or add a second verification method simply because no code was displayed.

## 2. Production configuration

Set/check these for the Vercel **Production** environment:

```dotenv
NEXT_PUBLIC_SITE_URL=https://createaivideos.app
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPPORT_EMAIL=support@createaivideos.app
```

`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is optional. Set it only to the real HTML-tag `content` value issued to your selected URL-prefix property. It is not a Google API key, a full `<meta>` tag, or the DNS `google-site-verification=...` record. Leave it unset when already verified using another method.

`NEXT_PUBLIC_BING_SITE_VERIFICATION` is also optional: use only Bing's real `msvalidate.01` meta-tag content if you choose that verification method. An approved import or existing verification does not require an invented second token.

After changing build-time public environment values, deploy again. Inspect the live homepage HTML for the correct canonical and, if using HTML-tag verification, the exact `google-site-verification` content. Do not publish private provider keys in a `NEXT_PUBLIC_` variable.

## 3. Check the live files before submission

| File | Exact production URL | What to do with it |
| --- | --- | --- |
| Sitemap | `https://createaivideos.app/sitemap.xml` | Submit this URL in Google and Bing's Sitemaps tools. |
| Robots | `https://createaivideos.app/robots.txt` | Inspect it; crawlers discover it themselves. Do not submit as a sitemap. |
| Optional AI guide | `https://createaivideos.app/llms.txt` | Check public facts and links. Do not submit as a sitemap or verification file. |

The retired-domain audit found malformed discovery links. Current release checks validate fresh new-domain responses rather than relying on that historical result.

Expected after this SEO update: **20 public sitemap URLs**, including eight feature pages, four guides, pricing, support and policy pages. No studio/account/API/private-media/preview URLs should appear. Every entry should resolve to a genuine public page with an intended production canonical. Publication changes can legitimately alter the count.

## Complete the old domain migration

Keep `editingapp.live` and `www.editingapp.live` connected. Their public URLs must permanently redirect to the matching path on `createaivideos.app`, not all to the homepage. Do not block the old site in robots.txt or remove its ownership records.

After checking redirects, verify old and new properties using the same owner account. Open **Settings → Change of address** in each applicable old-domain and www variant property and select the new site. Google's tool performs pre-move checks. A www-to-apex change within the same new domain needs redirects/canonicals, not another Change of Address request. [Google Change of Address](https://support.google.com/webmasters/answer/9370220)

Keep the old domain and redirects for **at least one year**, preferably longer while links or visitors use them. Update public profile links and monitor the old and new Search Console reports. OAuth callbacks, webhooks and signed requests intentionally remain outside public-page redirects; SEO does not require credential changes. [Google site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

## 4. Submit the sitemap to Google

1. Open [Google Search Console](https://search.google.com/search-console) and select the verified property covering `https://createaivideos.app/`.
2. Open **Sitemaps**.
3. Submit `https://createaivideos.app/sitemap.xml`. If the field already displays the website prefix, enter only `sitemap.xml`.
4. Review processing status and discovered URLs. Investigate a fetch/error status rather than repeatedly submitting.

Do not submit robots.txt, llms.txt, source-code files, database migrations, private URLs, or a list of API keys. Sitemap submission helps discovery; it does not establish indexing or ranking. [Google Sitemaps report](https://support.google.com/webmasters/answer/7451001)

## 5. Inspect important public pages

Use URL Inspection for the homepage, important feature pages, pricing and guides. Check the live page, crawl/index eligibility, declared canonical, and Google's selected canonical when available. Request indexing after relevant pages are deployed and publicly accessible; it is a request, not a guarantee or an instant update.

Start with these exact URLs:

```text
https://createaivideos.app/
https://createaivideos.app/features
https://createaivideos.app/features/ai-short-film-generator
https://createaivideos.app/features/ai-cartoon-series
https://createaivideos.app/features/faceless-video-generator
https://createaivideos.app/features/ai-ugc-product-ads
https://createaivideos.app/features/ai-real-estate-video-generator
https://createaivideos.app/features/ai-ad-remake
https://createaivideos.app/features/ai-digital-clone-presenter
https://createaivideos.app/features/podcast-to-shorts
https://createaivideos.app/pricing
https://createaivideos.app/guides
https://createaivideos.app/guides/how-to-make-ai-videos
https://createaivideos.app/guides/faceless-videos-vs-ai-cartoons
https://createaivideos.app/guides/how-to-write-a-faceless-video-script
https://createaivideos.app/guides/ai-ugc-ad-script-and-hooks
https://createaivideos.app/about
https://createaivideos.app/contact
https://createaivideos.app/privacy
https://createaivideos.app/terms
```

Use the Pages/indexing report to distinguish expected exclusions (login/private/preview/retired content) from excluded pages intended for search. Never make private user content public just to resolve an indexing warning.

## 6. Check Google's generative-AI controls and reporting

For the verified property, open **Settings → Search generative AI**. Confirm that the site is included, either directly or through the applicable parent. Inclusion is the default; an inherited exclusion can override your expectation. Google documents worldwide rollout of this control on August 31, 2026. [Search generative AI control](https://support.google.com/webmasters/answer/16908024)

Use the **Generative AI performance report** to review AI Overviews/AI Mode impressions by page, date, country, and device. A property with insufficient impressions may not show the report. Do not read its absence as proof of a technical failure. [Generative AI performance report](https://support.google.com/webmasters/answer/16984139)

These controls are separate from training choices such as Google-Extended. No special AI file or schema forces inclusion or a top recommendation. Google's current guide explicitly rejects llms.txt ranking benefits and arbitrary AI content-length rules. [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## 7. Set up Bing and support Copilot discovery

Open [Bing Webmaster Tools](https://www.bing.com/webmasters/). You can import an already-verified Google property with your approval or use Bing's offered manual verification method. Importing requires granting Bing access to the selected Google account's property information; choose the correct site. [Bing's import instructions](https://blogs.bing.com/webmaster/2019/9/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools/)

Submit the same `https://createaivideos.app/sitemap.xml` in Bing's **Sitemaps** tool, then review URL Inspection and crawl diagnostics. [Bing Sitemaps documentation](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed)

IndexNow can later notify participating search engines of actual public URL additions, updates, or removals. It is optional; this document does not claim that a key or submission integration is configured. Do not send private generation/account URLs. Indexing and Copilot citations are not guaranteed. [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a)

## 8. AI search is not the same as training permission

| Service | Search/retrieval agent | Separate training agent |
| --- | --- | --- |
| OpenAI | OAI-SearchBot; ChatGPT-User for user actions | GPTBot |
| Anthropic | Claude-SearchBot; Claude-User for user actions | ClaudeBot |
| Perplexity | PerplexityBot; Perplexity-User for user actions | The documented search bot is not a foundation-model training crawler. |

Allow intended public search access without changing private authentication. Training access is a separate owner decision; it is not required just to permit the search bot. See [OpenAI](https://developers.openai.com/api/docs/bots), [Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), and [Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

Robots access does not prove indexing, actual AI citations, or firewall access from provider IPs. There is no universal AI-platform sitemap-submission form. Keep content accessible, truthful, and useful, and measure observed referrals/citations rather than promising them.

## 9. Remaining owner actions and measurement

- Keep the working ownership records for both domains. Ownership was confirmed in the owner session; do not share passwords or tokens or add a second verification method unnecessarily.
- Both the bare-domain and www migrations are now in progress. Preserve the old domains, matching-path redirects and ownership records, and review migration/indexing reports as Google recrawls. Do not cancel or resubmit either confirmed move.
- This release passed live production checks for all 20 public pages after deployment, in addition to the local build and regression suite. Re-run the checks after future changes.
- Supply genuine business/operator details, approved legal policies, real public profiles, and authorized product examples. Do not fabricate testimonials, review stars, or legal claims.
- Retry PageSpeed Insights after the HTTP 429 rate limit clears; review Search Console Core Web Vitals when field data is available. No measured performance score is claimed here.
- Record deployment date, submitted sitemap, important URL inspection outcomes, search/AI impressions, and meaningful product signups over time. Allow data to accumulate before judging results.
- Continue improving original examples and guidance from actual product use. No implementation can guarantee top rankings, recommendation placement, or an indexing deadline.

For the observed baseline and technical limitations, read [GEO analysis](./GEO-ANALYSIS.md).

## Repeatable release check

The project includes a read-only smoke checker. After deploying, run:

```powershell
node scripts/check-domain-redirects.mjs
node scripts/check-seo.mjs https://createaivideos.app --production
npm run seo:export
```

The redirect preflight checks HTTP-to-HTTPS, www and old-domain variants, including path/query preservation and loop detection. The SEO checker validates 20 intended pages, the exact homepage title/H1, twelve descriptive hero image alts, visible-content parity for FAQ JSON-LD, social images, internal links, discovery files, private noindex headers and hidden-page 404s. Update its expected routes when adding genuinely published pages. These checks do not authenticate to Google, submit URLs, measure real-user performance or prove rich-result eligibility.

The homepage FAQPage markup describes the same questions and answers shown in “Questions, answered.” It is not a Google FAQ rich-result feature: Google retired that display in May 2026. No ranking or AI-citation benefit is promised. [Google's documentation changelog](https://developers.google.com/search/updates)

The export command fetches the live canonical sitemap and writes `output/seo/GOOGLE-CONSOLE-SETUP.txt`, `output/seo/search-console-urls.txt` and a reference `output/seo/sitemap.xml`. Submit the **live sitemap URL** in Google, not a Windows path or local file upload. The URL list is for inspecting public pages; no bulk Indexing API request is made. No new Supabase tables, Trigger variables or provider credentials are needed for this SEO release.
