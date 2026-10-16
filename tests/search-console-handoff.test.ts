import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublishedFeatures } from "@/lib/features/catalog";
import { productionSiteUrl, publicPages } from "@/lib/seo/site";

const setup = readFileSync(new URL("../docs/seo/SEARCH-CONSOLE-SETUP.md", import.meta.url), "utf8");

describe("new-domain Search Console handoff", () => {
  it("lists every shipped public URL and no private account route", () => {
    const block = [...setup.matchAll(/```text\r?\n([\s\S]*?)```/g)].map(([, text]) => text).join("\n");
    const urls = block.trim().split(/\r?\n/).filter(Boolean);
    const expected = [...publicPages.map(({ path }) => `${productionSiteUrl}${path}`), ...getPublishedFeatures().map(({ slug }) => `${productionSiteUrl}/features/${slug}`)];
    expect([...urls].sort()).toEqual([...expected].sort());
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("distinguishes the sitemap from ownership and OAuth branding", () => {
    expect(setup).toContain("https://createaivideos.app/sitemap.xml");
    expect(setup).toContain("No HTML verification file is required when DNS verification already works");
    expect(setup).toContain("cannot generate a substitute");
    expect(setup).toContain("Search Console is not Google Cloud OAuth branding");
    expect(setup).toContain("at least one year");
    expect(setup).toContain("sitemap.xml");
  });
});
