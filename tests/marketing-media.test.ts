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
import { ExampleVisual, exampleVisuals } from "@/components/marketing/example-visual";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
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

  it("replaces fake hero cards with real, opt-in video and three image concepts", () => {
    const $ = load(renderToStaticMarkup(createElement(HeroShowcase)));
    const video = $("video");
    expect(video.length).toBe(1);
    expect(video.attr("controls")).toBeDefined();
    expect(video.attr("playsinline")).toBeDefined();
    expect(video.attr("preload")).toBe("none");
    expect(video.attr("autoplay")).toBeUndefined();
    expect(video.attr("loop")).toBeUndefined();
    expect(video.attr("width")).toBe("1920");
    expect(video.attr("height")).toBe("1080");
    expect(video.attr("aria-label")).toContain("AI-generated");
    expect($(`#${video.attr("aria-describedby")}`).text()).toContain("silent");
    expect(statSync(assetPath(video.attr("poster")!)).size).toBeGreaterThan(1000);
    const webm = video.find("source[type='video/webm']");
    expect(webm.length).toBe(1);
    const webmBytes = readFileSync(assetPath(webm.attr("src")!));
    expect(webmBytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
    expect(webmBytes.length).toBeLessThan(500_000);
    const source = video.find("source[type='video/mp4']");
    expect(source.attr("type")).toBe("video/mp4");
    const clip = readFileSync(assetPath(source.attr("src")!));
    expect(clip.subarray(4, 8).toString()).toBe("ftyp");
    expect(clip.length).toBeLessThan(2_000_000);
    expect(clip.includes(Buffer.from("soun"))).toBe(false);
    expect($("img").length).toBe(3);
    expect($.text()).toContain("not ETA exports");
    const credit = $("a[href^='https://pixabay.com/videos/']");
    expect(credit.text()).toContain("michellemorseu");
    expect(credit.attr("rel")).toContain("noopener");
    expect($("iframe").length).toBe(0);
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
    expect($("video").length).toBe(1);
    for (const slug of slugs) {
      const card = $(`#tools a[href='/features/${slug}']`);
      expect(card.length).toBe(1);
      expect(card.find("img").attr("alt")).toContain("AI-generated");
      expect(card.text()).toContain("AI-generated concept");
    }
    expect($.text()).not.toContain("Small wonders");
    expect($.text()).not.toContain("Find your kind of quiet");
  });

  it("does not resurrect unpublished feature cards", async () => {
    mocks.published.mockResolvedValue([]);
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("#tools a[href^='/features/']").length).toBe(0);
  });

  it("updates the actual studio cards without changing generation entry points", async () => {
    const $ = load(renderToStaticMarkup(await StudioLibraryPage()));
    expect($("main img").length).toBe(3);
    expect($("main img[loading='eager']").length).toBe(1);
    for (const path of ["/studio/faceless", "/studio/cartoons", "/studio/ugc"]) {
      expect($(`main a[href='${path}']`).length).toBe(1);
    }
    expect($.text()).toContain("Demo workspace");
    expect($.text()).toContain("Recent projects");
    expect($.text().match(/AI-generated concept/g)?.length).toBe(3);
  });
});
