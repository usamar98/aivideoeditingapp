import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ published: vi.fn() }));
vi.mock("@/lib/features/repository", () => ({ getPublishedFeaturesData: mocks.published }));
vi.mock("@/config/brand", () => ({ brand: {
  name: "ETA", shortName: "ETA", siteUrl: "https://www.editingapp.live",
  description: "Create faceless videos and AI cartoons with ETA.",
  supportEmail: "support@editingapp.live",
} }));

import { featureCatalog, featureDefinitionSchema, getPublishedFeatures, isPublicMediaPath, type FeatureDefinition } from "@/lib/features/catalog";
import { indexableDeployment, isPublicPath, normalizeSiteUrl, privateCrawlerPaths, productionSiteUrl, publicPages } from "@/lib/seo/site";
import { publicMetadata, publicRobots } from "@/lib/seo/metadata";
import { absoluteUrl, breadcrumbSchema, identitySchema, organizationId, pageSchema, pricingOffers, serializeJsonLd, websiteId } from "@/lib/seo/structured-data";
import { llmsDocument } from "@/lib/seo/llms";
import robots from "@/app/robots";
import sitemap, { dynamic as sitemapMode } from "@/app/sitemap";
import { GET as getLlms, dynamic as llmsMode } from "@/app/llms.txt/route";

const origin = "https://www.editingapp.live";
const cartoon = featureCatalog.find((feature) => feature.slug === "ai-cartoon-series")!;

function storedFeature(slug: string, status: FeatureDefinition["status"], developmentOnly = false): FeatureDefinition {
  return { ...cartoon, slug, status, developmentOnly, seo: { ...cartoon.seo, canonicalPath: `/features/${slug}` } };
}

function discoveryFixtures() {
  return [
    ...getPublishedFeatures(),
    storedFeature("draft-tool", "draft"),
    storedFeature("retired-tool", "retired"),
    storedFeature("unavailable-tool", "unavailable"),
    storedFeature("development-tool", "published", true),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  mocks.published.mockResolvedValue(getPublishedFeatures());
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical origins and public paths", () => {
  it.each([undefined, "", "  ", "invalid", "http://www.editingapp.live", "https://localhost", "https://child.localhost", "https://worker.local", "https://preview.vercel.app", "https://intranet", "https://127.0.0.1", "https://[::1]", "https://user:secret@example.com", "https://example.com:444"])("uses the production origin for unsafe configuration %s", (value) => {
    expect(normalizeSiteUrl(value)).toBe(productionSiteUrl);
  });

  it.each(["https://editingapp.live", "https://editingapp.live/subpage?search=1#anchor", " https://WWW.EDITINGAPP.LIVE/ ", "https://www.editingapp.live///"])("normalizes the canonical website variant %s", (value) => {
    expect(normalizeSiteUrl(value)).toBe(origin);
  });

  it("normalizes an explicitly configured public HTTPS origin without leaking its path", () => {
    expect(normalizeSiteUrl("https://WWW.example.com/path?secret=value#section")).toBe("https://www.example.com");
  });

  it.each(["/", "/features", "/features/faceless-video-generator", "/guides/faceless-videos-vs-ai-cartoons", "/pricing"])("accepts the public page path %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/studio", "/studio/jobs", "/admin/features", "/api/health", "/auth/callback", "/login", "/login/", "/login/help", "//outside.example", "/\\outside.example", "/../studio", "/%2e%2e/studio", "/features?preview=true", "/features#section", "https://outside.example/features", "features"])("rejects nonpublic or noncanonical page path %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it("lists only distinct public pages with stable editorial modification dates", () => {
    expect(new Set(publicPages.map((page) => page.path)).size).toBe(publicPages.length);
    for (const page of publicPages) {
      expect(isPublicPath(page.path)).toBe(true);
      expect(Number.isNaN(Date.parse(page.modifiedAt))).toBe(false);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
    }
  });
});

describe("indexability and social metadata", () => {
  it.each([
    [{ NODE_ENV: "production" }, true],
    [{ NODE_ENV: "development" }, false],
    [{ NODE_ENV: "test" }, false],
    [{ NODE_ENV: "production", VERCEL_ENV: "production" }, true],
    [{ NODE_ENV: "production", VERCEL_ENV: "preview" }, false],
    [{ NODE_ENV: "production", VERCEL_ENV: "development" }, false],
    [{ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true" }, false],
  ])("evaluates deployment indexability for %j", (env, expected) => {
    expect(indexableDeployment(env)).toBe(expected);
  });

  it("allows useful search previews only for a public production page", () => {
    expect(publicRobots()).toEqual({ index: true, follow: true, googleBot: {
      index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1,
    } });
    expect(publicRobots(false)).toEqual({ index: false, follow: false });
  });

  it.each(["preview", "development"])("noindexes public metadata on %s deployments", (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    expect(publicRobots()).toEqual({ index: false, follow: false });
    expect(publicMetadata({ title: "Pricing", description: "Plan details", path: "/pricing" }).robots).toEqual({ index: false, follow: false });
  });

  it("noindexes demo deployments even with a production Vercel environment", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(publicRobots()).toEqual({ index: false, follow: false });
  });

  it("uses page-specific canonical, Open Graph and Twitter content with an absolute image", () => {
    const metadata = publicMetadata({ title: "Video tools", description: "Compare supported video tools", path: "/features" });
    expect(metadata.title).toEqual({ absolute: "Video tools | ETA" });
    expect(metadata.alternates?.canonical).toBe(`${origin}/features`);
    expect(metadata.openGraph).toMatchObject({ title: "Video tools", description: "Compare supported video tools", url: `${origin}/features`, siteName: "ETA", locale: "en_US", images: [{ url: `${origin}/opengraph-image`, width: 1200, height: 630, alt: "Video tools — ETA" }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Video tools", description: "Compare supported video tools", images: [{ url: `${origin}/opengraph-image` }] });
  });

  it("supports an explicit image and noindex without inheriting homepage values", () => {
    const metadata = publicMetadata({ title: "Preview", description: "Not public yet", path: "/features/preview", image: "/features/preview/opengraph-image", indexable: false });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.openGraph).toMatchObject({ url: `${origin}/features/preview`, images: [{ url: `${origin}/features/preview/opengraph-image` }] });
  });
});

describe("structured data", () => {
  it("escapes HTML script terminators and Unicode separators without changing JSON values", () => {
    const input = { text: "</script><script>alert('test')</script>\u2028next\u2029line", nested: { name: "A & B" } };
    const serialized = serializeJsonLd(input);
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(JSON.parse(serialized)).toEqual(input);
  });

  it("connects real ETA organization and website identities using stable absolute IDs", () => {
    const identity = identitySchema();
    expect(identity["@context"]).toBe("https://schema.org");
    expect(identity["@graph"].map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    expect(identity["@graph"][0]).toMatchObject({ "@id": organizationId, name: "ETA", url: `${origin}/`, logo: { url: `${origin}/brand/eta-logo.png` }, contactPoint: { email: "support@editingapp.live", url: `${origin}/contact` } });
    expect(identity["@graph"][1]).toMatchObject({ "@id": websiteId, publisher: { "@id": organizationId } });
    expect(organizationId).toBe(`${origin}/#organization`);
    expect(websiteId).toBe(`${origin}/#website`);
  });

  it("connects each page to the same organization and website", () => {
    expect(pageSchema("/features", "Video tools", "Supported workflows", "CollectionPage")).toMatchObject({ "@type": "CollectionPage", "@id": `${origin}/features#webpage`, url: `${origin}/features`, name: "Video tools", description: "Supported workflows", isPartOf: { "@id": websiteId }, publisher: { "@id": organizationId } });
    expect(pageSchema("/about", "About", "About ETA")["@type"]).toBe("WebPage");
    expect(absoluteUrl("/pricing")).toBe(`${origin}/pricing`);
  });

  it("generates correctly ordered absolute breadcrumbs", () => {
    expect(breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }])).toEqual({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Features", item: `${origin}/features` },
    ] });
  });

  it("publishes exact billed monthly/yearly amounts, not misleading annual monthly equivalents", () => {
    const offers = pricingOffers();
    expect(offers.map((offer) => [offer.name, offer.price, offer.priceSpecification.billingDuration])).toEqual([
      ["Starter — monthly subscription", "29.99", "P1M"], ["Starter — annual subscription", "239.88", "P1Y"],
      ["Creator — monthly subscription", "49.99", "P1M"], ["Creator — annual subscription", "359.88", "P1Y"],
      ["Studio — monthly subscription", "99.99", "P1M"], ["Studio — annual subscription", "959.88", "P1Y"],
    ]);
    expect(offers.map((offer) => offer.description)).toEqual([
      "440 credits per month. Billed monthly.", "5,280 credits per year. Billed annually; full year's credits granted upfront.",
      "1,100 credits per month. Billed monthly.", "13,200 credits per year. Billed annually; full year's credits granted upfront.",
      "2,200 credits per month. Billed monthly.", "26,400 credits per year. Billed annually; full year's credits granted upfront.",
    ]);
    for (const offer of offers) {
      expect(offer.url).toBe(`${origin}/pricing`);
      expect(offer.priceCurrency).toBe("USD");
      expect(offer.priceSpecification.price).toBe(offer.price);
      expect(offer.priceSpecification.priceCurrency).toBe("USD");
    }
  });

  it("does not fabricate reviews, ratings, FAQ rich-result eligibility or unsupported search actions", () => {
    const graph = serializeJsonLd([identitySchema(), pageSchema("/pricing", "Pricing", "Plan information"), pricingOffers(), breadcrumbSchema([{ name: "Home", path: "/" }])]);
    for (const unsupported of ["aggregateRating", "ratingValue", "reviewCount", '"@type":"Review"', '"@type":"FAQPage"', '"@type":"HowTo"', '"@type":"SearchAction"']) expect(graph).not.toContain(unsupported);
  });
});

describe("robots, sitemap and AI discovery", () => {
  it("allows production public crawling, blocks private areas and advertises one normalized sitemap", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: privateCrawlerPaths }, sitemap: `${origin}/sitemap.xml` });
    expect(privateCrawlerPaths).toEqual(expect.arrayContaining(["/studio", "/admin", "/api", "/auth"]));
  });

  it.each(["preview", "development"])("disallows crawling on a %s deployment", (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("disallows demo crawling", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("keeps sitemap and llms routes fresh rather than building permanent publication snapshots", () => {
    expect(sitemapMode).toBe("force-dynamic");
    expect(llmsMode).toBe("force-dynamic");
  });

  it("emits only canonical public pages and published feature URLs with real editorial dates", async () => {
    mocks.published.mockResolvedValue(discoveryFixtures());
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual([...publicPages.map((page) => `${origin}${page.path}`), ...getPublishedFeatures().map((feature) => `${origin}/features/${feature.slug}`)]);
    expect(new Set(urls).size).toBe(urls.length);
    for (const entry of entries) {
      const url = new URL(entry.url);
      expect(url.origin).toBe(origin);
      expect(isPublicPath(url.pathname)).toBe(true);
      expect(url.search).toBe(""); expect(url.hash).toBe("");
      expect(entry).not.toHaveProperty("changeFrequency");
      expect(entry).not.toHaveProperty("priority");
    }
    expect(entries.find((entry) => entry.url.endsWith(cartoon.slug))?.lastModified).toBe(cartoon.modifiedAt);
  });

  it("derives discovery URLs from validated slugs rather than trusting an overridden canonical", async () => {
    mocks.published.mockResolvedValue([{ ...cartoon, seo: { ...cartoon.seo, canonicalPath: "//outside.example/private" } }]);
    const entries = await sitemap();
    expect(entries.at(-1)?.url).toBe(`${origin}/features/${cartoon.slug}`);
    expect(llmsDocument(await mocks.published())).not.toContain("outside.example");
  });

  it("never turns a failed publication lookup into a successful discovery response", async () => {
    mocks.published.mockRejectedValue(new Error("Catalog unavailable"));
    await expect(sitemap()).rejects.toThrow("Catalog unavailable");
    await expect(getLlms()).rejects.toThrow("Catalog unavailable");
  });

  it("llms links only to public pages and supported, published workflows", () => {
    const document = llmsDocument(discoveryFixtures());
    const links = [...document.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => new URL(match[1]));
    expect(links.length).toBe(publicPages.length - 1 + getPublishedFeatures().length);
    for (const url of links) { expect(url.origin).toBe(origin); expect(isPublicPath(url.pathname)).toBe(true); }
    for (const slug of ["draft-tool", "retired-tool", "unavailable-tool", "development-tool", "ecommerce-product-videos"]) expect(document).not.toContain(`/features/${slug}`);
    for (const path of ["/studio", "/admin", "/api", "/auth", "/login"]) expect(document).not.toContain(`${origin}${path}`);
    expect(document).toContain("not generative moving footage");
    expect(document).toContain("not guaranteed");
    expect(document).toContain("does not guarantee search ranking or AI citations");
  });

  it("keeps feature text on its own markdown line and strips injected HTML/link brackets", () => {
    const feature = { ...cartoon, name: "Example [name]\n<extra>", description: "Approved [description]\r\n<extra>" };
    const line = llmsDocument([feature]).split("\n").find((value) => value.includes(`/features/${cartoon.slug}`))!;
    expect(line).toContain("Example  name   extra ");
    expect(line).toContain("Approved  description    extra ");
    expect(line).not.toContain("<extra>");
    expect((line.match(/\[/g) || []).length).toBe(1);
    expect((line.match(/\]/g) || []).length).toBe(1);
  });

  it("serves llms as plain text with noindex, no-store and MIME-sniffing protection", async () => {
    const response = await getLlms();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(llmsDocument(getPublishedFeatures()));
  });
});

describe("feature canonical and media validation", () => {
  it("accepts every shipped feature's own canonical route", () => {
    for (const feature of featureCatalog) expect(featureDefinitionSchema.safeParse(feature).success).toBe(true);
  });

  it.each(["//outside.example", "/\\outside.example", "/features/other-feature", "/features/ai-cartoon-series/", "/features/ai-cartoon-series?preview=true", "/features/ai-cartoon-series#section", "/studio/cartoon", "/features/../studio", "https://outside.example"])("rejects an invalid feature canonical %s", (canonicalPath) => {
    expect(featureDefinitionSchema.safeParse({ ...cartoon, seo: { ...cartoon.seo, canonicalPath } }).success).toBe(false);
  });

  it.each(["/demo/weather-workshop.png", "/brand/eta-logo.svg", "/examples/first-film.mp4", "/media/thumbs/frame_01.webp", "/examples/animation.webm"])("accepts local public media %s", (path) => {
    expect(isPublicMediaPath(path)).toBe(true);
  });

  it.each(["//outside.example/video.mp4", "https://outside.example/image.png", "/\\outside.example/image.png", "/api/assets/image.png", "/auth/image.png", "/studio/private.mp4", "/admin/image.png", "/examples/../private.png", "/%2e%2e/private.png", "/demo/image.png?token=private", "/demo/image.png#fragment", "/demo/file.html", "/demo/image", "demo/image.png"])("rejects private, remote or unsafe media %s", (path) => {
    expect(isPublicMediaPath(path)).toBe(false);
    const media = { type: "image", url: path, title: "Example", description: "Example artwork", published: true };
    expect(featureDefinitionSchema.safeParse({ ...cartoon, exampleMedia: [media] }).success).toBe(false);
  });

  it("validates thumbnails as strictly as their public example media", () => {
    const media = { type: "video", url: "/examples/cartoon.mp4", title: "Example", description: "Public example", published: true, thumbnailUrl: "/api/private-thumbnail.png" };
    expect(featureDefinitionSchema.safeParse({ ...cartoon, exampleMedia: [media] }).success).toBe(false);
  });
});
