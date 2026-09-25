# ETA search-engine setup and owner handoff

Updated: 2026-09-25. Production website: `https://www.editingapp.live`.

This is a setup guide, not confirmation that ownership is verified or any sitemap has been submitted. No authenticated Search Console or Bing account was inspected. Publish and verify the SEO changes before submitting their new URLs.

## 1. If Ownership verification gives you no code

First check the selected property and its status. **No new code is needed if it already says you are a verified owner.** Existing DNS verification, inherited verification, or an automatic method may explain this. Keep the existing verification in place.

If unverified, choose one route:

| Property | Method | Where the provided value belongs |
| --- | --- | --- |
| Domain: `editingapp.live` | DNS verification | Add Google's exact TXT record at your authoritative DNS provider; follow its root-host instructions. Do not put the TXT record in an app environment variable. |
| URL prefix: `https://www.editingapp.live/` | HTML tag | Expand the HTML-tag method. Put only the tag's `content` value into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, deploy, then verify. |

A Domain property uses DNS verification, not an HTML meta tag. The URL-prefix option is suitable when using this app's metadata integration. Never invent a token or copy a sample as your real value. [Google ownership-verification instructions](https://support.google.com/webmasters/answer/9008080)

If still stuck, share a screenshot showing the selected property and Ownership verification panel. Hide personal account details; there is no need to share credentials. Do not change DNS or add a second verification method simply because no code was displayed.

## 2. Production configuration

Set/check these for the Vercel **Production** environment:

```dotenv
NEXT_PUBLIC_SITE_URL=https://www.editingapp.live
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPPORT_EMAIL=support@editingapp.live
```

`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is optional. Set it only to the real HTML-tag `content` value issued to your selected URL-prefix property. It is not a Google API key, a full `<meta>` tag, or the DNS `google-site-verification=...` record. Leave it unset when already verified using another method.

`NEXT_PUBLIC_BING_SITE_VERIFICATION` is also optional: use only Bing's real `msvalidate.01` meta-tag content if you choose that verification method. An approved import or existing verification does not require an invented second token.

After changing build-time public environment values, deploy again. Inspect the live homepage HTML for the correct canonical and, if using HTML-tag verification, the exact `google-site-verification` content. Do not publish private provider keys in a `NEXT_PUBLIC_` variable.

## 3. Check the live files before submission

| File | Exact production URL | What to do with it |
| --- | --- | --- |
| Sitemap | `https://www.editingapp.live/sitemap.xml` | Submit this URL in Google and Bing's Sitemaps tools. |
| Robots | `https://www.editingapp.live/robots.txt` | Inspect it; crawlers discover it themselves. Do not submit as a sitemap. |
| Optional AI guide | `https://www.editingapp.live/llms.txt` | Check public facts and links. Do not submit as a sitemap or verification file. |

The baseline audit found double slashes in production discovery links and a missing llms.txt. Check the fresh deployed responses; do not assume a successful local build changed production.

Expected baseline after this SEO update: nine public sitemap URLs—home, features, the two feature pages, pricing, guides, the faceless-versus-cartoons guide, about, and contact. No studio/account/API/private-media/preview URLs should appear. Every entry should resolve to a genuine public page with an intended production canonical. Future published features can legitimately increase the count.

## 4. Submit the sitemap to Google

1. Open [Google Search Console](https://search.google.com/search-console) and select the verified property covering `https://www.editingapp.live/`.
2. Open **Sitemaps**.
3. Submit `https://www.editingapp.live/sitemap.xml`. If the field already displays the website prefix, enter only `sitemap.xml`.
4. Review processing status and discovered URLs. Investigate a fetch/error status rather than repeatedly submitting.

Do not submit robots.txt, llms.txt, source-code files, database migrations, private URLs, or a list of API keys. Sitemap submission helps discovery; it does not establish indexing or ranking. [Google Sitemaps report](https://support.google.com/webmasters/answer/7451001)

## 5. Inspect important public pages

Use URL Inspection for the homepage, both feature pages, pricing, and the new guide. Check the live page, crawl/index eligibility, declared canonical, and Google's selected canonical when available. Request indexing after relevant pages are deployed and publicly accessible; it is a request, not a guarantee or an instant update.

Start with these exact URLs:

```text
https://www.editingapp.live/
https://www.editingapp.live/features/ai-cartoon-series
https://www.editingapp.live/features/faceless-video-generator
https://www.editingapp.live/pricing
https://www.editingapp.live/guides/faceless-videos-vs-ai-cartoons
```

Use the Pages/indexing report to distinguish expected exclusions (login/private/preview/retired content) from excluded pages intended for search. Never make private user content public just to resolve an indexing warning.

## 6. Check Google's generative-AI controls and reporting

For the verified property, open **Settings → Search generative AI**. Confirm that the site is included, either directly or through the applicable parent. Inclusion is the default; an inherited exclusion can override your expectation. Google documents worldwide rollout of this control on August 31, 2026. [Search generative AI control](https://support.google.com/webmasters/answer/16908024)

Use the **Generative AI performance report** to review AI Overviews/AI Mode impressions by page, date, country, and device. A property with insufficient impressions may not show the report. Do not read its absence as proof of a technical failure. [Generative AI performance report](https://support.google.com/webmasters/answer/16984139)

These controls are separate from training choices such as Google-Extended. No special AI file or schema forces inclusion or a top recommendation. Google's current guide explicitly rejects llms.txt ranking benefits and arbitrary AI content-length rules. [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## 7. Set up Bing and support Copilot discovery

Open [Bing Webmaster Tools](https://www.bing.com/webmasters/). You can import an already-verified Google property with your approval or use Bing's offered manual verification method. Importing requires granting Bing access to the selected Google account's property information; choose the correct site. [Bing's import instructions](https://blogs.bing.com/webmaster/2019/9/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools/)

Submit the same `https://www.editingapp.live/sitemap.xml` in Bing's **Sitemaps** tool, then review URL Inspection and crawl diagnostics. [Bing Sitemaps documentation](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed)

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

- Confirm the account really has access to the correct Google/Bing property. No verification token or authenticated property data was supplied to this audit.
- Finish deployment, then inspect production—not only localhost.
- Supply genuine business/operator details, approved legal policies, real public profiles, and authorized product examples. Do not fabricate testimonials, review stars, or legal claims.
- Retry PageSpeed Insights after the HTTP 429 rate limit clears; review Search Console Core Web Vitals when field data is available. No measured performance score is claimed here.
- Record deployment date, submitted sitemap, important URL inspection outcomes, search/AI impressions, and meaningful product signups over time. Allow data to accumulate before judging results.
- Continue improving original examples and guidance from actual product use. No implementation can guarantee top rankings, recommendation placement, or an indexing deadline.

For the observed baseline and technical limitations, read [GEO analysis](./GEO-ANALYSIS.md).

## Repeatable release check

The project includes a read-only smoke checker. After deploying, run:

```powershell
node scripts/check-seo.mjs https://www.editingapp.live --production
```

It checks the current nine-page baseline, public metadata, JSON-LD parsing, social images, discovery files, private noindex headers and hidden-page 404s. Update its expected routes when adding genuinely published pages. It does not authenticate to Google, submit URLs, measure real-user performance or prove rich-result eligibility.
