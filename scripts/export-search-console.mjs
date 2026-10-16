import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

// Export only a fresh public production response, never private projects or keys.
const origin = "https://createaivideos.app";
const output = resolve(fileURLToPath(new URL("../output/seo/", import.meta.url)));
const sitemapUrl = `${origin}/sitemap.xml`;
const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, "Live sitemap must return HTTP 200 before exporting");
const xml = await response.text();
const $ = load(xml, { xmlMode: true });
assert.equal($("urlset").length, 1, "Expected a URL sitemap");
const urls = $("url > loc").map((_, element) => $(element).text().trim()).get();
assert.ok(urls.length > 0, "Empty sitemap");
assert.equal(new Set(urls).size, urls.length, "Duplicate sitemap URLs");
for (const value of urls) {
  const url = new URL(value);
  assert.equal(url.origin, origin, "Export only the new canonical domain");
  assert.ok(!url.search && !url.hash && !/^\/(studio|admin|api|auth|login)(\/|$)/.test(url.pathname), "Exclude private and noncanonical URLs");
}
const instructions = [
  "CREATE AI VIDEOS GOOGLE SEARCH CONSOLE HANDOFF", "",
  `Exported from the live sitemap: ${new Date().toISOString()}`,
  "Domain property: createaivideos.app",
  "Console: https://search.google.com/search-console",
  "Select the verified createaivideos.app property and open Sitemaps.",
  `Submit: ${sitemapUrl}`,
  "If Google already shows the site prefix, enter only sitemap.xml.", "",
  "FILES IN THIS FOLDER",
  "sitemap.xml: a snapshot for reference; submit the live URL above, not a local path.",
  "search-console-urls.txt: all public URLs for URL Inspection; not an API bulk-indexing request.", "",
  "VERIFICATION",
  "If DNS ownership is verified, keep that TXT record. No HTML verification file or API key is needed.",
  "For optional HTML-file verification, use Google's exact downloaded file unchanged in public/ and deploy it.",
  "For optional HTML-tag verification, set only the issued content token as NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION in Vercel Production, redeploy, then verify.",
  "Do not invent a google*.html filename or token. Do not share credentials.", "",
  "DOMAIN MOVE",
  "Verify old and new properties using the same owner account.",
  "After old URLs permanently redirect to matching new URLs, use Settings > Change of address for the old domain and www variant.",
  "Keep the old domain and redirects for at least one year; do not remove ownership records.", "",
  `Robots (automatic discovery, not a submission): ${origin}/robots.txt`,
  `Optional AI directory (not a sitemap): ${origin}/llms.txt`,
  "Never submit studio, login, API, account, private-media URLs, database files or secrets.",
  "Google Search Console is separate from Google Cloud OAuth branding and YouTube API compliance.",
  "Sitemap submission and Request indexing do not guarantee indexing, ranking or timing.", "",
];
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(join(output, "sitemap.xml"), xml),
  writeFile(join(output, "search-console-urls.txt"), `${urls.join("\n")}\n`),
  writeFile(join(output, "GOOGLE-CONSOLE-SETUP.txt"), instructions.join("\n")),
]);
console.log(JSON.stringify({ source: sitemapUrl, urls: urls.length, output, files: ["sitemap.xml", "search-console-urls.txt", "GOOGLE-CONSOLE-SETUP.txt"] }, null, 2));
