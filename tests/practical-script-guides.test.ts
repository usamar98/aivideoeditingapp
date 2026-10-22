import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import FacelessGuide, { metadata as facelessMetadata } from "@/app/guides/how-to-write-a-faceless-video-script/page";
import UgcGuide, { metadata as ugcMetadata } from "@/app/guides/ai-ugc-ad-script-and-hooks/page";
import GuidesPage from "@/app/guides/page";
import { publicPages } from "@/lib/seo/site";

const guides = [
  { Page: FacelessGuide, metadata: facelessMetadata, path: "/guides/how-to-write-a-faceless-video-script", feature: "/features/faceless-video-generator" },
  { Page: UgcGuide, metadata: ugcMetadata, path: "/guides/ai-ugc-ad-script-and-hooks", feature: "/features/ai-ugc-product-ads" },
];

describe("practical script guides", () => {
  it.each(guides)("publishes a substantive, dated and linked guide at $path", ({ Page, metadata, path, feature }) => {
    const $ = load(renderToStaticMarkup(createElement(Page)));
    expect($("h1")).toHaveLength(1);
    expect($("article").text().trim().split(/\s+/).length).toBeGreaterThanOrEqual(1500);
    expect($("time[datetime='2026-10-22']")).toHaveLength(1);
    expect($("main a[href='/about']").length).toBeGreaterThan(0);
    expect($(`main a[href='${feature}']`).length).toBeGreaterThan(0);
    expect($("article a[href='/pricing']").length).toBeGreaterThan(0);
    expect($("article a[href='/guides/how-to-make-ai-videos']").length).toBeGreaterThan(0);
    expect(metadata.alternates?.canonical).toBe(`https://createaivideos.app${path}`);
    expect(metadata.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-22", modifiedTime: "2026-10-22" });
    const graphs = $("script[type='application/ld+json']").map((_, item) => JSON.parse($(item).text())).get();
    const article = graphs.find(graph => graph["@type"] === "Article");
    expect(article).toMatchObject({ headline: $("h1").text(), datePublished: "2026-10-22", dateModified: "2026-10-22", author: { name: "Create AI Videos" }, mainEntityOfPage: `https://createaivideos.app${path}#webpage` });
    expect(JSON.stringify(graphs)).not.toMatch(/AggregateRating|FAQPage|"HowTo"/);
    expect(publicPages.find(page => page.path === path)?.modifiedAt).toBe("2026-10-22");
    $("article a[href^='#']").each((_, item) => expect($($(item).attr("href")!).length).toBe(1));
  });

  it("lists every guide in both the hub HTML and CollectionPage markup", () => {
    const $ = load(renderToStaticMarkup(createElement(GuidesPage)));
    const expected = publicPages.filter(page => page.path.startsWith("/guides/"));
    expect(expected).toHaveLength(4);
    for (const guide of expected) expect($(`main article a[href='${guide.path}']`).length).toBeGreaterThan(0);
    const graph = JSON.parse($("script[type='application/ld+json']").first().text());
    expect(graph.mainEntity.itemListElement.map((item: { url: string }) => item.url)).toEqual(expected.map(guide => `https://createaivideos.app${guide.path}`));
  });
});
