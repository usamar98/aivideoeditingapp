import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { indexableDeployment } from "./site";

export function publicRobots(indexable = true): Metadata["robots"] {
  const allow = indexable && indexableDeployment();
  return { index: allow, follow: allow, ...(allow ? { googleBot: { index: true, follow: true, "max-image-preview": "large" as const, "max-snippet": -1, "max-video-preview": -1 } } : {}) };
}

export function publicMetadata({ title, description, path, indexable = true, image = "/opengraph-image" }: {
  title: string; description: string; path: string; indexable?: boolean; image?: string;
}): Metadata {
  const url = new URL(path, brand.siteUrl).toString();
  const images = [{ url: new URL(image, brand.siteUrl).toString(), width: 1200, height: 630, alt: `${title} — ${brand.name}` }];
  return {
    title: { absolute: `${title} | ${brand.name}` }, description,
    alternates: { canonical: url },
    robots: publicRobots(indexable),
    openGraph: { type: "website", title, description, url, siteName: brand.name, locale: "en_US", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
