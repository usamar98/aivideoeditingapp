import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => null }));

import { metadata as studioMetadata } from "@/app/studio/layout";
import PricingPage, { metadata as pricingMetadata } from "@/app/pricing/page";
import { brand } from "@/config/brand";
import { formatUsd, pricingTiers } from "@/lib/billing/pricing";

describe("studio and pricing SEO corrections", () => {
  it("gives the studio its own description, canonical and social metadata", () => {
    const url = new URL("/studio", brand.siteUrl).toString();
    expect(studioMetadata.title).toEqual({ absolute: "Studio | Create AI Videos" });
    expect(studioMetadata.description).toContain("saved work");
    expect(studioMetadata.description).not.toBe(brand.description);
    expect(studioMetadata.alternates?.canonical).toBe(url);
    expect(studioMetadata.openGraph).toMatchObject({
      title: "Studio", url, description: studioMetadata.description, siteName: brand.name,
    });
    expect(studioMetadata.twitter).toMatchObject({
      title: "Studio", description: studioMetadata.description,
    });
  });

  it("keeps the studio private to crawlers and out of archives", () => {
    expect(studioMetadata.robots).toEqual({ index: false, follow: false, noarchive: true });
  });

  it("renders one descriptive pricing H1 using the actual monthly starting price", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingPage)));
    const startingPrice = formatUsd(Math.min(...pricingTiers.map((tier) => tier.monthlyAmount))).replace(/\.00$/, "");
    expect($("h1")).toHaveLength(1);
    expect($("h1").text()).toBe(`Create AI Videos pricing: plans and credits from ${startingPrice}/month`);
    expect($("h1").text()).toBe("Create AI Videos pricing: plans and credits from $9/month");
    expect($("h1").text()).not.toContain("A plan for every kind of creator");
    expect(pricingMetadata.alternates?.canonical).toBe(new URL("/pricing", brand.siteUrl).toString());
    expect($("table").text()).toContain(formatUsd(Math.min(...pricingTiers.map((tier) => tier.monthlyAmount))));
  });
});
