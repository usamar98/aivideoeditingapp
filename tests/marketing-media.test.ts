import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ published: vi.fn() }));
vi.mock("@/lib/features/repository", () => ({ getPublishedFeaturesData: mocks.published }));
vi.mock("@/lib/supabase/server", () => ({
  getViewer: async () => ({ id: "demo-user", fixture: true }),
  createClient: async () => null,
}));
vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => null }));
vi.mock("@/components/studio/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => children }));

import Home from "@/app/page";
import StudioLibraryPage from "@/app/studio/page";
import FeaturesPage from "@/app/features/page";
import { ExampleVisual, exampleVisuals } from "@/components/marketing/example-visual";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { ChannelShowcase } from "@/components/marketing/channel-showcase";
import { SiteFooter } from "@/components/marketing/site-chrome";
import { heroMediaRows, heroStockCredits } from "@/components/marketing/hero-media";
import { UpcomingFeatures } from "@/components/marketing/upcoming-features";
import { UgcPreview } from "@/components/studio/ugc-preview";

const slugs = ["faceless-video-generator", "ai-cartoon-series", "ai-ugc-product-ads"];
const assetPath = (src: string) => join(process.cwd(), "public", src);

beforeEach(() => mocks.published.mockResolvedValue(slugs.map((slug) => ({ slug }))));

describe("AI marketing media", () => {
  it.each(Object.keys(exampleVisuals) as (keyof typeof exampleVisuals)[])("uses an optimized, accessible local image for %s", (variant) => {
    const $ = load(renderToStaticMarkup(createElement(ExampleVisual, { variant })));
    const bytes = readFileSync(assetPath(exampleVisuals[variant].src));
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    expect(bytes.length).toBeLessThan(350_000);
    expect($("img").attr("alt")).toContain("AI-generated");
    expect($("img").attr("srcset")).toBeTruthy();
    expect($("img").attr("sizes")).toBeTruthy();
    expect($("img").attr("loading")).toBe("lazy");
    expect($.text()).toContain("AI-generated concept");
  });

  it("renders two seamless, opposite-direction rows and removes the old floating layout", () => {
    const $ = load(renderToStaticMarkup(createElement(HeroShowcase)));
    expect($(".hero-reels[aria-hidden='true']").length).toBe(1);
    expect($(".hero-reel-row").length).toBe(2);
    expect($(".hero-reel-row").map((_, el) => $(el).attr("data-direction")).get()).toEqual(["left", "right"]);
    $(".hero-reel-row").each((_, el) => {
      const groups = $(el).find(".hero-reel-group");
      expect(groups.length).toBe(2);
      expect(groups.eq(0).html()).toBe(groups.eq(1).html());
      expect(groups.eq(0).find(".hero-reel").length).toBe(6);
    });
    expect($(".hero-phone, .hero-orbit, .hero-social").length).toBe(0);
    expect($(".hero-reel-footer svg").length).toBe(24);
    const media = heroMediaRows.flat();
    expect(new Set(media.map((item) => item.id)).size).toBe(12);
    expect(media.filter((item) => item.kind === "video").map((item) => item.name)).toEqual(expect.arrayContaining(["fantasy-forest", "ai-portrait", "hero-space", "hero-cartoon", "hero-anime", "hero-ugc"]));
    expect(media.filter((item) => item.kind === "image").map((item) => item.src)).toEqual(expect.arrayContaining(["/examples/faceless-space.webp", "/examples/cartoon-forest.webp", "/examples/presenter-product.webp"]));
    expect($.text()).toContain("AI UGC");
    expect($.text()).toContain("Digital clone · Soon");
    expect($.text()).toContain("AI concept");
    expect($(".hero-caption, .hero-credits").length).toBe(0);
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("aspect-ratio: 9/16");
    expect(css).toContain('animation-direction: reverse');
    expect(css).toContain('.hero-canvas[data-motion="on"][data-visible="true"] .hero-reel-track');
    expect(css).toContain(".hero-reel-track { animation: none !important; }");
  });

  it("renders lightweight silent previews with paused server markup and accessible motion controls", () => {
    const $ = load(renderToStaticMarkup(createElement(HeroShowcase)));
    expect($("section").attr("data-motion")).toBe("off");
    expect($("button").attr("aria-label")).toBe("Background animation disabled by your preferences");
    expect($("button").attr("aria-pressed")).toBe("false");
    expect($("video").length).toBe(12);
    $("video").each((_, element) => {
      const video = $(element);
      expect(video.attr("playsinline")).toBeDefined();
      expect(video.attr("muted")).toBeDefined();
      expect(video.attr("loop")).toBeDefined();
      expect(video.attr("preload")).toBe("none");
      expect(video.attr("autoplay")).toBeUndefined();
      expect(video.attr("aria-hidden")).toBe("true");
      expect(statSync(assetPath(video.attr("poster")!)).size).toBeGreaterThan(1000);
      const webmBytes = readFileSync(assetPath(video.find("source[type='video/webm']").attr("src")!));
      expect(webmBytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
      expect(webmBytes.length).toBeLessThan(2_000_000);
      const clip = readFileSync(assetPath(video.find("source[type='video/mp4']").attr("src")!));
      expect(clip.subarray(4, 8).toString()).toBe("ftyp");
      expect(clip.length).toBeLessThan(2_000_000);
      expect(clip.includes(Buffer.from("soun"))).toBe(false);
    });
    expect($("img").length).toBe(12);
    $("img").each((_, element) => {
      expect($(element).attr("alt")).toBe("");
      expect($(element).attr("loading")).toBe("lazy");
      // A 16:9 source needs a wider rendition for a sharp 9:16 cover crop.
      expect($(element).attr("sizes")).toContain("610px");
    });
    expect($("iframe").length).toBe(0);
  });

  it("keeps source credits in the footer instead of the removed hero caption box", () => {
    const $ = load(renderToStaticMarkup(createElement(SiteFooter)));
    expect($.text()).toContain("not ETA exports");
    expect($.text()).toContain("not cloning or speaking demos");
    const credit = $("a[href^='https://pixabay.com/videos/']");
    expect(credit.length).toBe(6);
    expect(credit.text()).toContain("michellemorseu");
    for (const { href } of heroStockCredits) expect($(`details a[href='${href}']`).length).toBe(1);
    expect(credit.attr("rel")).toContain("noopener");
    expect($("iframe").length).toBe(0);
  });

  it.each(["cartoon", "ugc", "space", "anime"])("keeps the new %s clip within the mobile media budget", (name) => {
    for (const extension of ["mp4", "webm"]) {
      expect(statSync(assetPath(`/examples/hero-${name}.${extension}`)).size).toBeLessThan(200_000);
    }
    expect(statSync(assetPath(`/examples/hero-${name}-poster.jpg`)).size).toBeLessThan(60_000);
  });

  it("keeps the clone concept but removes the old social publishing card", () => {
    const $ = load(renderToStaticMarkup(createElement(UpcomingFeatures)));
    expect($("article").length).toBe(1);
    expect($.text().match(/Coming soon/g)?.length).toBe(2);
    expect($("video[controls]").length).toBe(0);
    expect($("video[loop][muted][playsinline]").length).toBe(1);
    expect($("video").attr("autoplay")).toBeUndefined();
    expect($("video").attr("preload")).toBe("none");
    expect($.text()).toContain("not an ETA clone or a speaking demo");
    expect($("[data-feature='social-publishing']").length).toBe(0);
    expect($("a[href^='/studio']").length).toBe(0);
    expect($("button[aria-label^='Play preview:']").length).toBe(1);
    expect($.text()).not.toContain("Auto-post and schedule planned");
    expect($.text()).not.toContain("Create here. Share everywhere");
    expect($.text()).toContain("No impersonation");
  });

  it.each([true, false])("labels the UGC visual as a concept (compact=%s)", (compact) => {
    const $ = load(renderToStaticMarkup(createElement(UgcPreview, { compact })));
    expect($("img").attr("alt")).toContain("fictional presenter");
    expect($.text()).toContain("AI-generated concept");
    expect($.text()).not.toContain("Layout illustration");
  });

  it("keeps all published homepage feature links and replaces their artwork", async () => {
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("h1").length).toBe(1);
    expect($("video").length).toBe(16);
    for (const slug of slugs) {
      const card = $(`#tools a[href='/features/${slug}']`);
      expect(card.length).toBe(1);
      expect(card.find("img").attr("alt")).toContain("AI-generated");
      expect(card.text()).toContain("AI-generated concept");
    }
    expect($.text()).not.toContain("Small wonders");
    expect($.text()).not.toContain("Find your kind of quiet");
  });

  it("keeps three desktop columns and removes only the social card", async () => {
    mocks.published.mockResolvedValue([...slugs, "podcast-to-shorts"].map((slug) => ({ slug })));
    const $ = load(renderToStaticMarkup(await Home()));
    const grid = $('[data-testid="feature-grid"]');
    expect(grid.attr("class")).toContain("lg:grid-cols-3");
    expect(grid.children("article").map((_, el) => $(el).attr("data-feature")).get()).toEqual([...slugs, "podcast-to-shorts", "digital-clone"]);
    expect(grid.find('[class*="col-span"]').length).toBe(0);
  });
  it("does not resurrect unpublished feature cards", async () => {
    mocks.published.mockResolvedValue([]);
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("#tools a[href^='/features/']").length).toBe(0);
  });

  it("uses the studio's shared card design and order on the public feature directory", async () => {
    const published = [...slugs, "podcast-to-shorts"];
    mocks.published.mockResolvedValue([...published].reverse().map((slug) => ({ slug, name: slug, description: "Published tool" })));
    const $ = load(renderToStaticMarkup(await FeaturesPage()));
    const grid = $('[data-testid="feature-grid"]');
    expect(grid.attr("class")).toContain("sm:grid-cols-2");
    expect(grid.attr("class")).toContain("lg:grid-cols-3");
    expect(grid.children("article").map((_, el) => $(el).attr("data-feature")).get()).toEqual([...published, "digital-clone"]);
    expect(grid.find("h2").length).toBe(5);
    expect(grid.find("img").length).toBe(3);
    expect(grid.find("video[controls]").length).toBe(0);
    expect(grid.find("video[loop][muted][playsinline]").length).toBe(1);
    expect(grid.find('[class*="col-span"]').length).toBe(0);
    expect(grid.find("a[href^='/studio']").length).toBe(0);
    for (const slug of published) expect(grid.find(`a[href='/features/${slug}']`).length).toBe(1);
    for (const slug of ["digital-clone"]) {
      expect($(`[data-feature='${slug}']`).length).toBe(1);
      expect(grid.find(`[data-feature='${slug}']`).text()).toContain("Coming soon");
    }
    const schema = JSON.parse($("script[type='application/ld+json']").first().text());
    const items = schema["@graph"].find((item: { "@type": string }) => item["@type"] === "ItemList").itemListElement;
    expect(items.map((item: { url: string }) => new URL(item.url).pathname)).toEqual(published.map((slug) => `/features/${slug}`));
  });

  it("keeps unpublished tools hidden and custom published tools linked in the feature directory", async () => {
    mocks.published.mockResolvedValue([{ slug: "custom-video-tool", name: "Custom video tool", description: "A published custom workflow." }]);
    const $ = load(renderToStaticMarkup(await FeaturesPage()));
    const grid = $('[data-testid="feature-grid"]');
    expect(grid.children("article").map((_, el) => $(el).attr("data-feature")).get()).toEqual(["digital-clone", "custom-video-tool"]);
    expect(grid.find("a[href^='/features/']").length).toBe(1);
    expect(grid.find("a[href='/features/custom-video-tool']").text()).toContain("A published custom workflow.");
  });

  it("updates the actual studio cards without changing generation entry points", async () => {
    const $ = load(renderToStaticMarkup(await StudioLibraryPage()));
    expect($("main img").length).toBe(3);
    expect($("main img[loading='eager']").length).toBe(1);
    for (const path of ["/studio/faceless", "/studio/cartoons", "/studio/ugc", "/studio/shorts"]) {
      expect($(`main a[href='${path}']`).length).toBe(1);
    }
    expect($.text()).toContain("Demo workspace");
    expect($.text()).toContain("Recent projects");
    expect($.text().match(/AI-generated concept/g)?.length).toBe(3);
  });

  it("matches the homepage's card order in a responsive studio grid", async () => {
    const $ = load(renderToStaticMarkup(await StudioLibraryPage()));
    const grid = $('[data-testid="feature-grid"]');
    expect(grid.parent().attr("class")).toContain("@container");
    expect(grid.attr("class")).toContain("@xl:grid-cols-2");
    expect(grid.attr("class")).toContain("@4xl:grid-cols-3");
    expect(grid.children("article").map((_, el) => $(el).attr("data-feature")).get()).toEqual([...slugs, "podcast-to-shorts", "digital-clone"]);
    expect(grid.find('[class*="col-span"]').length).toBe(0);
    expect(grid.find("h2").length).toBe(5);
    expect(grid.find("h3").length).toBe(0);
    expect(grid.find("a[href^='/features/']").length).toBe(0);
    for (const feature of ["digital-clone"]) {
      const card = grid.find(`[data-feature='${feature}']`);
      expect(card.text()).toContain("Coming soon");
      expect(card.find("a[href^='/studio']").length).toBe(0);
      expect(card.find("button[aria-label^='Play preview:']").length).toBe(1);
    }
  });

  it.each([Home, FeaturesPage, StudioLibraryPage])("uses still images and the requested viral titles in each shared grid", async (Page) => {
    const $ = load(renderToStaticMarkup(await Page()));
    for (const [slug, title] of [["faceless-video-generator", "Viral faceless Video"], ["ai-cartoon-series", "Viral Cartoon videos"]]) {
      const card = $(`[data-feature='${slug}']`);
      expect(card.find("h2, h3").text()).toBe(title);
      expect(card.find("img").length).toBe(1);
      expect(card.find("video").length).toBe(0);
    }
    expect($("[data-feature='social-publishing']").length).toBe(0);
  });

  it("inserts the channel preview between hero and tools without the old benefit strip", async () => {
    const $ = load(renderToStaticMarkup(await Home()));
    expect($(".hero-canvas").next().attr("id")).toBe("channel-preview");
    expect($("#channel-preview").next().attr("id")).toBe("tools");
    for (const copy of ["Start with an idea", "Make every scene yours", "Give your story a voice", "Ready for the small screen", "app.tokportal.com", "33 accounts"]) {
      expect($.text()).not.toContain(copy);
    }
    expect($("#channel-showcase-title").text()).toBe("Connect and Grow your channel on automation");
  });

  it("shows an honest interactive platform preview with playable local clips and no invented metrics", () => {
    const $ = load(renderToStaticMarkup(createElement(ChannelShowcase)));
    const buttons = $("button[aria-controls='channel-preview-panel']");
    expect(buttons.length).toBe(2);
    expect(buttons.eq(0).attr("aria-pressed")).toBe("true");
    expect(buttons.eq(1).text()).toContain("TikTokComing soon");
    expect($("a[href='/studio/social']").text()).toContain("Open YouTube publishing");
    expect($("dl dd").map((_, el) => $(el).text()).get()).toEqual(["—", "—", "—"]);
    expect($.text()).toContain("Illustrative activity · Not live analytics");
    expect($.text()).toContain("not ETA exports");
    expect($("iframe").length).toBe(0);
    expect($("video[controls]").length).toBe(0);
    expect($("video[loop][muted][playsinline]").length).toBe(3);
    expect($("button[aria-label^='Play preview:']").length).toBe(3);
    expect($.text()).not.toContain("Tap to play");
    $("video").each((_, element) => {
      const video = $(element);
      expect(video.attr("preload")).toBe("none");
      expect(video.attr("autoplay")).toBeUndefined();
      expect(video.attr("playsinline")).toBeDefined();
      expect(video.attr("aria-label")).toContain("AI-generated");
      expect(statSync(assetPath(video.attr("poster")!)).size).toBeGreaterThan(1000);
      for (const source of video.find("source").toArray()) {
        const bytes = readFileSync(assetPath($(source).attr("src")!));
        expect(bytes.length).toBeLessThan(2_000_000);
        expect(bytes.includes(Buffer.from("soun"))).toBe(false);
      }
    });
  });
});
