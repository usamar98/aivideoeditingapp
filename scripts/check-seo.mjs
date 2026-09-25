import assert from "node:assert/strict";

// Read-only HTTP checks. Run against a local production build or the deployed site.
const origin = new URL(process.argv[2] || "http://localhost:3002");
const production = process.argv.includes("--production");
const canonicalOrigin = "https://www.editingapp.live";
const paths = ["/", "/features", "/features/ai-cartoon-series", "/features/faceless-video-generator", "/features/ai-ugc-product-ads", "/features/podcast-to-shorts", "/pricing", "/guides", "/guides/faceless-videos-vs-ai-cartoons", "/about", "/contact", "/privacy", "/terms"];
const titles = new Set();
const descriptions = new Set();
const results = [];
const seenImages = new Set();

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1]?.replaceAll("&amp;", "&");
}
function meta(html, name) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([value]) => value).find((value) => attr(value, "name") === name || attr(value, "property") === name);
  return tag ? attr(tag, "content") : undefined;
}
async function request(path, redirect = "follow") {
  return fetch(new URL(path, origin), { redirect, signal: AbortSignal.timeout(30000), headers: { "User-Agent": "ETA-SEO-Verification/1.0" } });
}

for (const path of paths) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path}: HTTP status`);
  const html = await response.text();
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = meta(html, "description");
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag).find((tag) => attr(tag, "rel") === "canonical");
  assert.equal(canonical && new URL(attr(canonical, "href")).toString(), `${canonicalOrigin}${path}`, `${path}: canonical`);
  assert.ok(title?.endsWith(" | ETA"), `${path}: branded title`);
  assert.ok(!titles.has(title), `${path}: unique title`);
  titles.add(title);
  assert.ok(description?.length > 40 && !descriptions.has(description), `${path}: unique useful description`);
  descriptions.add(description);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: one H1`);
  assert.ok(html.includes("support@editingapp.live"), `${path}: contact information`);
  assert.ok(!html.includes("support@example.com"), `${path}: no placeholder support`);
  const robots = meta(html, "robots");
  if (production) {
    assert.ok(robots?.includes("index") && !robots.includes("noindex"), `${path}: production indexing`);
    assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"), `${path}: no conflicting header`);
  } else assert.ok(robots?.includes("noindex"), `${path}: preview/development noindex`);
  const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json));
  assert.ok(graphs.length >= 2, `${path}: identity and page JSON-LD`);
  assert.ok(!JSON.stringify(graphs).includes("AggregateRating"), `${path}: no invented ratings`);
  const image = meta(html, "og:image");
  assert.ok(image && meta(html, "twitter:card") === "summary_large_image", `${path}: social metadata`);
  if (!seenImages.has(image)) {
    const localImage = new URL(image);
    const asset = await request(`${localImage.pathname}${localImage.search}`);
    assert.equal(asset.status, 200, `${path}: social image response`);
    assert.ok(asset.headers.get("content-type")?.includes("image/png"), `${path}: PNG social preview`);
    assert.ok((await asset.arrayBuffer()).byteLength > 1000, `${path}: social preview body`);
    seenImages.add(image);
  }
  results.push({ path, status: response.status, title, robots, jsonLdBlocks: graphs.length });
}

const sitemapResponse = await request("/sitemap.xml");
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
assert.equal(new Set(urls).size, urls.length, "No duplicate sitemap entries");
assert.deepEqual([...urls].sort(), paths.map((path) => `${canonicalOrigin}${path}`).sort(), "Expected public sitemap routes");
const robotsResponse = await request("/robots.txt");
assert.equal(robotsResponse.status, 200);
const robots = await robotsResponse.text();
assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
if (production) {
  assert.ok(robots.includes("Allow: /"));
  assert.ok(!/^Disallow: \/\s*$/m.test(robots));
} else assert.ok(/^Disallow: \/\s*$/m.test(robots));
const llmsResponse = await request("/llms.txt");
assert.equal(llmsResponse.status, 200);
const llms = await llmsResponse.text();
assert.ok(llms.startsWith("# ETA\n"));
assert.ok(llms.includes(`${canonicalOrigin}/pricing`));
assert.ok(llms.includes(`${canonicalOrigin}/features/ai-ugc-product-ads`), "UGC feature in AI discovery file");
assert.ok(llms.includes(`${canonicalOrigin}/features/podcast-to-shorts`), "Shorts feature in AI discovery file");
assert.ok(!/https?:\/\/[^\s)]*\/(studio|admin|api|auth)(\/|\b)/.test(llms));

for (const path of ["/login", "/studio", "/studio/jobs", "/studio/ugc", "/studio/ugc/demo", "/studio/shorts", "/studio/shorts/demo", "/api/shorts/00000000-0000-4000-8000-000000000001", "/api/ugc/00000000-0000-4000-8000-000000000001", "/admin/features", "/api/health"]) {
  const response = await request(path, "manual");
  assert.ok(response.headers.get("x-robots-tag")?.includes("noindex"), `${path}: private/auth noindex header`);
  if (path === "/login") assert.ok(!(await response.text()).includes('rel="canonical"'), "Login must not inherit homepage canonical");
}
for (const path of ["/features/ecommerce-product-videos", "/features/not-a-real-feature", "/features/ecommerce-product-videos/opengraph-image"]) {
  assert.equal((await request(path)).status, 404, `${path}: hidden/unknown content`);
}

console.log(JSON.stringify({ origin: origin.origin, production, pages: results, sitemapUrls: urls.length, socialImages: seenImages.size, checks: "passed" }, null, 2));
