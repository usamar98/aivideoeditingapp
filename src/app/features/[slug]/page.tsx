import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Info, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/studio/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { canIndexFeature } from "@/lib/features/catalog";
import { getFeatureData, getStaticFeatureSlugs } from "@/lib/features/repository";

export async function generateStaticParams() {
  return (await getStaticFeatureSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const feature = await getFeatureData(slug);
  if (!feature) return {};
  const indexable = canIndexFeature(feature);
  return {
    title: feature.seo.title,
    description: feature.seo.description,
    alternates: { canonical: feature.seo.canonicalPath },
    robots: { index: indexable, follow: indexable, noarchive: !indexable },
    openGraph: { title: feature.seo.title, description: feature.seo.description, url: feature.seo.canonicalPath, type: "website" },
    twitter: { card: "summary_large_image", title: feature.seo.title, description: feature.seo.description },
  };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feature = await getFeatureData(slug);
  if (!feature) notFound();
  if (feature.developmentOnly && process.env.NODE_ENV === "production") notFound();

  const related = (await Promise.all(feature.relatedFeatures.map(getFeatureData))).filter(Boolean);
  const canonicalUrl = new URL(feature.seo.canonicalPath, brand.siteUrl).toString();
  const publishedVideos = feature.exampleMedia.filter((item) => item.type === "video" && item.published && item.thumbnailUrl && item.publishedAt);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: feature.name,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: feature.description,
        url: canonicalUrl,
        featureList: feature.capabilities,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Features", item: `${brand.siteUrl}/features` },
          { "@type": "ListItem", position: 2, name: feature.name, item: canonicalUrl },
        ],
      },
      ...publishedVideos.map((video) => ({
        "@type": "VideoObject",
        name: video.title,
        description: video.description,
        contentUrl: new URL(video.url, brand.siteUrl).toString(),
        thumbnailUrl: new URL(video.thumbnailUrl!, brand.siteUrl).toString(),
        uploadDate: video.publishedAt,
        duration: video.durationIso,
        transcript: video.transcript,
      })),
    ],
  };

  return (
    <main className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }} />
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8"><Link href="/"><BrandMark /></Link><nav className="flex items-center gap-3"><Button asChild variant="ghost" size="sm"><Link href="/features">All features</Link></Button><Button asChild size="sm"><Link href="/studio">Open studio</Link></Button></nav></header>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pt-20">
        <div><Badge variant={feature.status === "published" ? "success" : "warning"}>{feature.status === "published" ? "Available" : "Development preview"}</Badge><h1 className="mt-5 text-4xl font-bold tracking-[-0.045em] sm:text-5xl">{feature.seo.heading}</h1><p className="mt-5 text-lg leading-8 text-muted-foreground">{feature.description}</p><Button asChild size="lg" className="mt-7"><Link href={slug === "faceless-video-generator" ? "/studio/faceless" : "/studio/cartoons"}>{slug === "faceless-video-generator" ? "Create a faceless video" : "Open the cartoon editor"} <ArrowRight /></Link></Button></div>
        {feature.exampleMedia[0] && <Card className="overflow-hidden border-primary/20 p-2"><div className="relative aspect-video overflow-hidden rounded-lg"><Image src={feature.exampleMedia[0].url} alt={feature.exampleMedia[0].description} fill loading="eager" fetchPriority="high" sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" /></div><div className="p-3"><p className="text-sm font-semibold">{feature.exampleMedia[0].title}</p><p className="mt-1 text-xs text-muted-foreground">{feature.exampleMedia[0].description}</p></div></Card>}
      </section>

      <section className="border-y border-border bg-card/35"><div className="mx-auto grid max-w-6xl gap-px bg-border lg:grid-cols-3">{feature.benefits.map((benefit) => <div key={benefit} className="flex gap-3 bg-background p-7"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"><Check className="size-3.5" /></span><p className="text-sm leading-6">{benefit}</p></div>)}</div></section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">What it supports</p><h2 className="mt-3 text-3xl font-bold tracking-tight">A controlled path from idea to export</h2><ul className="mt-6 space-y-4">{feature.capabilities.map((capability) => <li key={capability} className="flex gap-3 text-base leading-7 text-muted-foreground"><Check className="mt-1 size-4 shrink-0 text-primary" />{capability}</li>)}</ul></div>
        <Card className="p-6"><div className="flex items-center gap-2 text-amber-200"><TriangleAlert className="size-4" /><h2 className="font-semibold">Important limitations</h2></div><ul className="mt-5 space-y-4">{feature.limitations.map((limitation) => <li key={limitation} className="flex gap-3 text-sm leading-6 text-muted-foreground"><Info className="mt-1 size-4 shrink-0" />{limitation}</li>)}</ul></Card>
      </section>

      {related.length > 0 && <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8"><h2 className="text-xl font-semibold">Related workflows</h2><div className="mt-4 flex flex-wrap gap-3">{related.map((item) => item && <Button asChild key={item.slug} variant="outline"><Link href={`/features/${item.slug}`}>{item.name}</Link></Button>)}</div></section>}
    </main>
  );
}
