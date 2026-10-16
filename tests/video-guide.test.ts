import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import VideoGuide, { metadata } from "@/app/guides/how-to-make-ai-videos/page";

describe("practical AI video creation guide", () => {
  it("has one descriptive heading and useful server-rendered content", () => {
    const $ = load(renderToStaticMarkup(createElement(VideoGuide)));
    expect($("h1")).toHaveLength(1);
    expect($("h1").text().toLowerCase()).toContain("how to make ai videos");
    expect($("main").text().trim().split(/\s+/).length).toBeGreaterThan(850);
    expect($.text()).not.toMatch(/\bETA\b|editingapp\.live/);
  });

  it("links to supported workflows, pricing and the existing comparison", () => {
    const $ = load(renderToStaticMarkup(createElement(VideoGuide)));
    for (const slug of ["ai-short-film-generator", "ai-cartoon-series", "faceless-video-generator", "ai-ugc-product-ads", "ai-real-estate-video-generator", "ai-ad-remake", "ai-digital-clone-presenter", "podcast-to-shorts"]) {
      expect($(`main a[href='/features/${slug}']`).length).toBeGreaterThan(0);
    }
    expect($("main a[href='/pricing']").length).toBeGreaterThan(0);
    expect($("main a[href='/guides/faceless-videos-vs-ai-cartoons']").length).toBeGreaterThan(0);
  });

  it("uses dated Article markup without invented ratings or HowTo rich-result claims", () => {
    const $ = load(renderToStaticMarkup(createElement(VideoGuide)));
    const graphs = $("script[type='application/ld+json']").map((_, element) => JSON.parse($(element).html()!)).get();
    const nodes = graphs.flatMap((graph) => graph["@graph"] ?? [graph]);
    const article = nodes.find((node) => node["@type"] === "Article");
    expect(article).toMatchObject({ datePublished: "2026-10-16", dateModified: "2026-10-16", author: { name: "Create AI Videos" } });
    expect(JSON.stringify(graphs)).not.toMatch(/AggregateRating|FAQPage|"HowTo"/);
    expect($("time[datetime='2026-10-16']").length).toBeGreaterThan(0);
  });

  it("has the new-domain canonical and article social metadata", () => {
    expect(metadata.alternates?.canonical).toBe("https://createaivideos.app/guides/how-to-make-ai-videos");
    expect(metadata.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-16", modifiedTime: "2026-10-16" });
  });
});
