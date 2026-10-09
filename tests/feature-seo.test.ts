import { describe, expect, it } from "vitest";

import { canIndexFeature, featureCatalog, getPublishedFeatures } from "@/lib/features/catalog";

describe("feature publishing rules", () => {
  it("indexes only published production features", () => {
    expect(getPublishedFeatures().map((feature) => feature.slug)).toEqual(["ai-real-estate-video-generator", "ai-cartoon-series", "faceless-video-generator", "ai-ugc-product-ads", "ai-short-film-generator", "ai-digital-clone-presenter", "ai-ad-remake", "podcast-to-shorts"]);
    expect(canIndexFeature(featureCatalog.find(f => f.slug === "ecommerce-product-videos")!)).toBe(false);
  });

  it("derives canonical metadata from the shared record", () => {
    const feature = featureCatalog[0];
    expect(feature.seo.canonicalPath).toBe(`/features/${feature.slug}`);
    expect(feature.seo.title.length).toBeLessThanOrEqual(65);
    expect(feature.seo.description.length).toBeLessThanOrEqual(165);
  });
});
