import { describe, expect, it } from "vitest";

import { canIndexFeature, featureCatalog, getPublishedFeatures } from "@/lib/features/catalog";

describe("feature publishing rules", () => {
  it("indexes only published production features", () => {
    expect(getPublishedFeatures().map((feature) => feature.slug)).toEqual(["ai-cartoon-series", "faceless-video-generator"]);
    expect(canIndexFeature(featureCatalog[1])).toBe(false);
  });

  it("derives canonical metadata from the shared record", () => {
    const feature = featureCatalog[0];
    expect(feature.seo.canonicalPath).toBe(`/features/${feature.slug}`);
    expect(feature.seo.title.length).toBeLessThanOrEqual(65);
    expect(feature.seo.description.length).toBeLessThanOrEqual(165);
  });
});
