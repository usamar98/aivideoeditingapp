import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublishedFeaturesData } from "@/lib/features/repository";
import { publicMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, breadcrumbSchema, pageSchema } from "@/lib/seo/structured-data";

const title = "AI Video Tools: Faceless Videos, Cartoons & UGC Ads";
const description = "Choose faceless videos, AI cartoons or presenter-led product ads. Compare scripts, hooks, formats and credit costs before creating with ETA.";
export const metadata = publicMetadata({ title, description, path: "/features" });
export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  const features = await getPublishedFeaturesData();
  return <MarketingPage title="More ways to bring your ideas to life" description={description} eyebrow="AI video creation tools">
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      pageSchema("/features", title, description, "CollectionPage"),
      breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }]),
      { "@type": "ItemList", itemListElement: features.map((feature, index) => ({ "@type": "ListItem", position: index + 1, name: feature.name, url: absoluteUrl(`/features/${feature.slug}`) })) },
    ] }} />
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => <Card key={feature.slug}><CardHeader><CardTitle>{feature.name}</CardTitle><CardDescription className="leading-7">{feature.description}</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href={`/features/${feature.slug}`}>Explore {feature.name.toLowerCase()} <ArrowRight /></Link></Button></CardContent></Card>)}
    </div>
    <section className="mt-12 max-w-3xl space-y-4 text-base leading-8 text-muted-foreground">
      <h2 className="text-2xl font-semibold text-foreground">Choose the workflow that fits your idea</h2>
      <p>Faceless videos combine still images with narration and optional captions. Cartoons generate moving character scenes with actions and dialogue. UGC product ads pair a fictional AI presenter with your product photos and editable hook variants. Every workflow has a review step before the separate rendering stage.</p>
      <p>AI output needs a human review. Check facts, pronunciation, visual consistency and permission to use any uploaded artwork before you publish.</p>
      <div className="flex flex-wrap gap-6"><Link className="text-primary underline underline-offset-4" href="/guides/faceless-videos-vs-ai-cartoons">Compare the workflows</Link><Link className="text-primary underline underline-offset-4" href="/pricing">See plans and credit costs</Link></div>
    </section>
  </MarketingPage>;
}
