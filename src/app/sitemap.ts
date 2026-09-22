import type { MetadataRoute } from "next";

import { brand } from "@/config/brand";
import { getPublishedFeaturesData } from "@/lib/features/repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const features = await getPublishedFeaturesData();
  const staticPages: MetadataRoute.Sitemap = [
    { url: brand.siteUrl, lastModified: "2026-09-22T00:00:00.000Z", changeFrequency: "weekly", priority: 1 },
    { url: `${brand.siteUrl}/features`, lastModified: "2026-09-22T00:00:00.000Z", changeFrequency: "weekly", priority: 0.8 },
  ];
  return [
    ...staticPages,
    ...features.map((feature) => ({
      url: new URL(feature.seo.canonicalPath, brand.siteUrl).toString(),
      lastModified: feature.modifiedAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
  ];
}
