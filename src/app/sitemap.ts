import type { MetadataRoute } from "next";

import { getPublishedFeaturesData } from "@/lib/features/repository";
import { canIndexFeature } from "@/lib/features/catalog";
import { publicPages } from "@/lib/seo/site";
import { absoluteUrl } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const features = await getPublishedFeaturesData();
  const staticPages: MetadataRoute.Sitemap = publicPages.map((page) => ({ url: absoluteUrl(page.path), lastModified: page.modifiedAt }));
  return [
    ...staticPages,
    ...features.filter(canIndexFeature).map((feature) => ({
      url: absoluteUrl(`/features/${feature.slug}`),
      lastModified: feature.modifiedAt,
    })),
  ];
}
