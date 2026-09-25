import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { indexableDeployment, privateCrawlerPaths } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(indexableDeployment() ? { allow: "/", disallow: privateCrawlerPaths } : { disallow: "/" }),
    },
    sitemap: new URL("/sitemap.xml", brand.siteUrl).toString(),
  };
}
