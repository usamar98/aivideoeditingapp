import Link from "next/link";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { FeatureGrid, featuredToolSlugs } from "@/components/marketing/feature-grid";
import { getPublishedFeaturesData } from "@/lib/features/repository";
import { publicMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, breadcrumbSchema, pageSchema } from "@/lib/seo/structured-data";

const title = "AI Video Tools: Shorts, Faceless Videos, Cartoons & Ads";
const description = "Create faceless videos, AI cartoons, product ads or podcast Shorts. Compare editing controls, formats and credit costs before creating with ETA.";
export const metadata = publicMetadata({ title, description, path: "/features" });
export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  const features = await getPublishedFeaturesData();
  const additionalFeatures = features.filter((feature) => !featuredToolSlugs.includes(feature.slug));
  const orderedFeatures = [...featuredToolSlugs.flatMap((slug) => features.filter((feature) => feature.slug === slug)), ...additionalFeatures];
  return <MarketingPage title="More ways to bring your ideas to life" description={description} eyebrow="AI video creation tools">
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      pageSchema("/features", title, description, "CollectionPage"),
      breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }]),
      { "@type": "ItemList", itemListElement: orderedFeatures.map((feature, index) => ({ "@type": "ListItem", position: index + 1, name: feature.name, url: absoluteUrl(`/features/${feature.slug}`) })) },
    ] }} />
    <section aria-label="AI video tools"><FeatureGrid mode="directory" published={features.map((feature) => feature.slug)} additionalFeatures={additionalFeatures} /></section>
    <section className="mt-12 max-w-3xl space-y-4 text-base leading-8 text-muted-foreground">
      <h2 className="text-2xl font-semibold text-foreground">Choose the workflow that fits your idea</h2>
      <p>Faceless videos combine still images with narration and optional captions. Cartoons generate moving character scenes with actions and dialogue. UGC product ads pair a fictional AI presenter with your product photos and editable hook variants. Every workflow has a review step before the separate rendering stage.</p>
      <p>AI output needs a human review. Check facts, pronunciation, visual consistency and permission to use any uploaded artwork before you publish.</p>
      <div className="flex flex-wrap gap-6"><Link className="text-primary underline underline-offset-4" href="/guides/faceless-videos-vs-ai-cartoons">Compare the workflows</Link><Link className="text-primary underline underline-offset-4" href="/pricing">See plans and credit costs</Link></div>
    </section>
  </MarketingPage>;
}
