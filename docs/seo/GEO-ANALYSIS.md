# ETA: SEO, AEO and AI-search readiness audit

Audit date: 2026-09-25. Public production origin: `https://www.editingapp.live`.

This report separates the **observed production baseline** from the **local change plan**. It does not certify that local changes have been tested, deployed, indexed, or cited. SEO/AEO/GEO work improves discoverability and clarity; it cannot guarantee first place, an AI recommendation, or a particular amount of traffic.

Implementation follow-up: the local changes were subsequently completed and verified with 367 tests, a production build, browser checks and nine-page HTTP smoke checks. See [the final verification record](./FULL-AUDIT-REPORT.md#completed-local-verification--september-25-2026). Deployment, ownership, indexing and actual citations remain unverified.

## Evidence and limits

- Fresh unauthenticated HTTP requests inspected the homepage, feature directory, two published feature pages, robots.txt, sitemap.xml, llms.txt, and common licensing-file URLs.
- Public HTML was inspected before executing JavaScript. Source review covered route metadata, the feature catalog, and existing crawl controls.
- A search tool returned cached content for an older photo-editing product. Fresh HTTP instead returned the current faceless/cartoon app. The cache is not evidence of current production content.
- Search Console and Bing Webmaster Tools were not authenticated. Indexation, selected canonicals, traffic, manual actions, ownership state, and actual AI citations remain unverified.
- PageSpeed Insights requests encountered HTTP 429 during the overall audit. No current Core Web Vitals or Lighthouse score is established here. Recheck performance after deployment; do not treat absent data as a pass.
- No paid visibility APIs, paid generation tests, private account data, or crawler-provider network access were used.

## Observed production baseline

| Area | Fresh observation | Required action |
| --- | --- | --- |
| Public rendering | Home, `/features`, `/features/ai-cartoon-series`, and `/features/faceless-video-generator` return HTTP 200 with meaningful initial HTML. | Preserve server-rendered public content. |
| Brand identity | Live title is `EditingApp — Your AI video creation studio`; local branding changes use ETA. | Deploy consistent visible branding, titles, organization identity, and social previews together. |
| Discovery URLs | robots.txt advertises `https://www.editingapp.live//sitemap.xml`; sitemap contains `https://www.editingapp.live//features`. | Normalize the configured origin and construct absolute URLs safely. |
| Robots | Wildcard group permits public crawling. Private exclusions use `/studio/`, `/admin/`, `/api/`, `/auth/`, and `/login`. | Cover bare private roots as well as nested paths. |
| Answers | Homepage and feature pages lack a visible FAQ section. Several headings are expressive but do not identify the product on their own. | Add direct, factual definitions and answers without removing the site's personality. |
| Feature directory | Copy describes the internal publishing system rather than helping visitors choose a tool. | Explain the actual workflows, inputs, outputs, and differences. |
| Structured data | Feature detail markup includes SoftwareApplication and breadcrumbs; homepage has no Organization/WebSite graph. | Add truthful entity relationships matching the visible site. |
| AI discovery file | `/llms.txt` returns 404. | Optional public-content navigation file; not a Google ranking fix. |
| RSL | No robots.txt license association; `/rsl.xml` and `/license.xml` return 404. | No automatic license creation. Licensing requires an owner policy decision. |

## Readiness by dimension

The weights below are an editorial review framework, **not a search-engine metric**. No numeric overall score is assigned: indexation, authority, external citations, and performance evidence are incomplete.

| Dimension | Weight | Baseline assessment |
| --- | --- | --- |
| Citability | 25% | Accurate feature descriptions and limitations exist; clearer self-contained answers would help visitors compare workflows. |
| Structural readability | 20% | Heading hierarchy and lists exist; directory language and marketing-only headings need clearer context. |
| Multi-modal content | 15% | Illustrative artwork exists, but verified public generation samples and explanatory videos are missing. Do not label illustrations as product results. |
| Authority and brand signals | 20% | Branding is inconsistent between local and live versions. Confirmed support email is `support@editingapp.live`; business identity and external profiles require owner evidence. |
| Technical accessibility | 20% | Initial HTML is available and bot-user-agent probes succeed; malformed discovery URLs, private-root exclusions, and deployment verification remain. |

Wikipedia, Reddit, YouTube, and LinkedIn entity presence was **not verified**. Do not invent `sameAs` profiles, review counts, customers, credentials, or independent mentions. Publish useful demonstrations through genuine owned profiles when available; do not manufacture endorsements or Wikipedia eligibility.

## AI crawler access

All entries below are allowed on public pages by the observed wildcard rule. User-agent probes returned HTTP 200 plus the homepage's substantive HTML for Googlebot, OAI-SearchBot, GPTBot, Claude-SearchBot, ClaudeBot, and PerplexityBot. These tests do not establish access from each provider's real IP addresses or confirm that a crawl happened.

| Agent | Purpose | Policy consideration |
| --- | --- | --- |
| Googlebot | Google Search crawling | Keep intended public pages crawlable. |
| OAI-SearchBot | ChatGPT search discovery | Search access is independent of GPTBot training access. |
| GPTBot | Potential foundation-model training data | Allowing training is not a prerequisite for ChatGPT search. |
| ChatGPT-User | User-directed retrieval | Not the automatic search crawler; robots rules may not apply to user actions. |
| Claude-SearchBot | Claude search discovery | Distinct from the training bot. |
| Claude-User | User-directed Claude retrieval | Keep public pages accessible; retain authentication for private content. |
| ClaudeBot | Potential training data | Independent owner policy decision. |
| PerplexityBot | Perplexity search discovery | Not used for foundation-model training. |
| Perplexity-User | User-directed retrieval | Provider says this generally ignores robots.txt. |

References: [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots), [Anthropic crawler documentation](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

Specific robots groups do not inherit wildcard restrictions. If explicit search-bot groups are used, apply the same private-path rules to each. Do not disable application authorization or broadly bypass a firewall based only on a spoofable user-agent string. For a verified crawler-access problem, use the provider's current documented identity/IP checks.

## Public/private boundaries

Authentication and authorization protect private work; robots.txt is not access control. Keep studio projects, account details, prompt histories, uploaded characters, signed downloads, job IDs, API responses, and drafts outside public discovery files and marketing markup.

Use noindex for login/account/admin and non-production previews where appropriate. A crawler blocked by robots.txt cannot read a page's noindex directive, so a public login page can remain crawlable with noindex. Protected application routes must remain authenticated regardless of crawl settings. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

## Local change plan and acceptance checks

The implementation team is preparing normalized `www` canonicals; production/preview indexing controls; private-route noindex rules; truthful answers and entity JSON-LD; and a public-only llms.txt. Confirm these in the built output and deployed origin before marking them complete.

The intended baseline sitemap contains nine public URLs:

1. `/`
2. `/features`
3. `/features/ai-cartoon-series`
4. `/features/faceless-video-generator`
5. `/pricing`
6. `/guides`
7. `/guides/faceless-videos-vs-ai-cartoons`
8. `/about`
9. `/contact`

Published catalog additions may legitimately expand this list later. Draft/unavailable/retired pages must not enter it merely because a local fallback exists.

Acceptance checks:

- Every listed URL returns a useful public page with the intended canonical, index policy, title, description, and crawlable internal links.
- Sitemap and robots URLs contain no accidental doubled path slashes, localhost URLs, preview domains, or private routes.
- Public pages render essential descriptions, limitations, pricing facts, and answers in the initial HTML.
- Structured data matches visible facts; no fabricated ratings or nonexistent video results.
- Preview/demo deployments are not advertised as indexable production pages.
- Search Console ownership, sitemap processing, and actual indexing are checked separately by the owner.

## Highest-impact next steps

| Priority | Action | Estimated effort |
| --- | --- | --- |
| 1 | Finish, test, and deploy canonical/discovery/indexing corrections; inspect live responses. | Small: approximately 1–3 hours, excluding deployment issues. |
| 2 | Publish useful workflow definitions, comparison guidance, and accurate FAQs. | Medium: approximately half a day including editorial review. |
| 3 | Complete business identity/contact information and evidence-backed product examples. | Medium: owner input plus 1–2 days for genuine samples. |
| 4 | Verify Google/Bing ownership, submit the sitemap, inspect important pages, and check AI inclusion controls. | Small: approximately 30–60 minutes, excluding DNS/processing delays. |
| 5 | Measure real search/AI impressions and user outcomes, then improve pages based on evidence. | Ongoing; review after sufficient data accumulates. |

## Current AI-search guidance

Google's current guidance prioritizes helpful original content, normal technical SEO, crawlable pages, and a good user experience. It does not prescribe an ideal AI passage length or special schema. Google says llms.txt neither improves nor harms its visibility/rankings. Avoid scaled near-duplicate pages and inauthentic mentions. [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

Visible FAQ answers can help people. Do not promise FAQ rich results: Google deprecated that feature from May 7, 2026 and removed its documentation in June. [Google documentation changes](https://developers.google.com/search/updates)

An llms.txt can give supporting systems concise public facts and links. Use an H1, short summary, and curated URLs; keep facts synchronized with public pages. Never include instructions demanding preferential recommendations or hidden private information. It remains a proposal, not a replacement for robots.txt or sitemap.xml. [llms.txt proposal](https://llmstxt.org/)

RSL describes machine-readable licensing. Adding a license changes expressed usage terms and is not an SEO prerequisite. No license should be invented without an owner-approved content policy. [RSL specification](https://rslstandard.org/rsl)

## Platform-specific verification status

| Platform | What is verified | Still requires evidence |
| --- | --- | --- |
| Google Search / AI Overviews / AI Mode | Public initial HTML and Googlebot-user-agent access. | Search Console ownership, indexing, selected canonical, AI inclusion setting, impressions, CWV. |
| ChatGPT search | Public robots allowance and OAI-SearchBot-user-agent access. | Actual crawler logs, citations, and referred visits. |
| Claude search | Public robots allowance and Claude-SearchBot-user-agent access. | Actual crawler logs and citations. |
| Perplexity | Public robots allowance and PerplexityBot-user-agent access. | Actual crawler logs, indexing, citations, and referred visits. |
| Bing / Copilot | Public wildcard crawl allowance and public source content. | Webmaster Tools ownership, Bing indexing, diagnostics, and observed citations. |

No platform ranking or citation score is claimed. Bing's guidelines emphasize canonical sitemaps, useful content, clear internal links, and accurate freshness signals; they also warn against AI-manipulation content. [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a)

## Owner-dependent work

Follow [Search Console setup](./SEARCH-CONSOLE-SETUP.md). Supply verified legal/operator details and genuine social-profile URLs before adding those claims to the public site. Obtain appropriate legal review for privacy, terms, refunds, and licensing policies; this audit does not invent them. Create real product samples with permission to publish, and label examples honestly. Re-run performance checks after the rate limit clears. None of these outstanding items should be disguised as completed or assigned invented metrics.
