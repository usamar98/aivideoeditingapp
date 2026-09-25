import { notFound } from "next/navigation";
import { getFeatureData } from "@/lib/features/repository";
import { canIndexFeature } from "@/lib/features/catalog";
import { socialImage } from "@/lib/seo/social-image";

export const alt = "ETA — AI video creation workflow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const feature = await getFeatureData((await params).slug);
  if (!feature || !canIndexFeature(feature)) notFound();
  return socialImage(feature.seo.heading, feature.seo.description);
}
