import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Info, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { AnswerSection } from "@/components/marketing/answer-section";
import { JsonLd } from "@/components/marketing/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { canIndexFeature } from "@/lib/features/catalog";
import { getFeatureData } from "@/lib/features/repository";
import { featureEditorial } from "@/lib/seo/editorial-content";
import { publicMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, breadcrumbSchema, organizationId, pageSchema } from "@/lib/seo/structured-data";
import { UgcPreview } from "@/components/studio/ugc-preview";
import { ShortsPreview } from "@/components/studio/shorts-preview";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const feature = await getFeatureData(slug);
  if (!feature || !canIndexFeature(feature)) notFound();
  return publicMetadata({ title: feature.seo.title, description: feature.seo.description, path: `/features/${slug}`, image: `/features/${slug}/opengraph-image` });
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feature = await getFeatureData(slug);
  if (!feature || !canIndexFeature(feature)) notFound();
  const editorial = featureEditorial[slug];
  const related = (await Promise.all(feature.relatedFeatures.map(getFeatureData))).filter((item) => item && canIndexFeature(item));
  const media = feature.exampleMedia.filter((item) => item.published);
  const path = `/features/${slug}`;
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    pageSchema(path, feature.name, feature.description),
    { "@type": "SoftwareApplication", "@id": `${absoluteUrl(path)}#application`, name: feature.name, applicationCategory: "MultimediaApplication", operatingSystem: "Web", description: feature.description, url: absoluteUrl(path), featureList: feature.capabilities, provider: { "@id": organizationId } },
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }, { name: feature.name, path }]),
    ...media.filter((item) => item.type === "video" && item.thumbnailUrl && item.publishedAt).map((video) => ({
      "@type": "VideoObject", name: video.title, description: video.description, contentUrl: absoluteUrl(video.url), thumbnailUrl: absoluteUrl(video.thumbnailUrl!), uploadDate: video.publishedAt, duration: video.durationIso, transcript: video.transcript,
    })),
  ] };
  const studioPath = slug === "podcast-to-shorts" ? "/studio/shorts" : slug === "ai-ugc-product-ads" ? "/studio/ugc" : slug === "faceless-video-generator" ? "/studio/faceless" : slug === "ai-cartoon-series" ? "/studio/cartoons" : "/studio";

  return <>
    <SiteHeader />
    <main id="main-content">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pt-8 text-sm text-muted-foreground"><Link href="/">Home</Link><span aria-hidden>/</span><Link href="/features">Features</Link><span aria-hidden>/</span><span aria-current="page">{feature.name}</span></nav>
      <section className={`mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-10 ${media.length || slug === "ai-ugc-product-ads" || slug === "podcast-to-shorts" ? "lg:grid-cols-2 lg:items-center" : ""}`}>
        <div className="max-w-3xl"><Badge variant="success">Available workflow</Badge><h1 className="editorial mt-5 text-4xl tracking-tight sm:text-5xl">{feature.seo.heading}</h1><p className="mt-6 text-lg leading-8 text-muted-foreground">{feature.description}</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild size="lg"><Link href={studioPath}>Start creating <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/pricing">See pricing</Link></Button></div>{editorial && <p className="mt-5 text-xs text-muted-foreground">ETA product guide · Updated <time dateTime={editorial.updatedAt}>September 25, 2026</time></p>}</div>
        {slug === "ai-ugc-product-ads" && <div className="overflow-hidden rounded-3xl border border-border"><UgcPreview /><div className="bg-card p-5 text-center"><Link href="/studio/ugc/demo" className="text-sm text-primary underline underline-offset-4">Explore the sample hook editor →</Link></div></div>}
        {slug === "podcast-to-shorts" && <div><ShortsPreview /><Link href="/studio/shorts/demo" className="mt-4 block text-center text-sm text-primary underline">Try the sample clip editor →</Link></div>}
        {media.length > 0 && <div className="space-y-5">{media.map((item, index) => <Card key={item.url} className="overflow-hidden p-2">
          {item.type === "image" ? <div className="relative aspect-video overflow-hidden rounded-lg"><Image src={item.url} alt={item.description} fill loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /></div> : <video className="aspect-video w-full rounded-lg" controls preload="none" poster={item.thumbnailUrl} aria-label={item.title} src={item.url}>Your browser does not support video. <a href={item.url}>Download {item.title}</a></video>}
          <div className="p-3"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{item.description}</p>{item.type === "video" && item.transcript && <details className="mt-3 text-sm"><summary className="cursor-pointer">Read video transcript</summary><p className="mt-3 whitespace-pre-line leading-7">{item.transcript}</p></details>}</div>
        </Card>)}</div>}
      </section>
      <section aria-label="Benefits" className="border-y border-border"><div className="mx-auto grid max-w-6xl lg:grid-cols-3">{feature.benefits.map((benefit) => <div key={benefit} className="flex gap-3 p-6"><Check className="mt-1 size-4 shrink-0 text-primary" /><p className="text-sm leading-7">{benefit}</p></div>)}</div></section>
      {editorial && <section className="mx-auto max-w-6xl px-6 py-16"><h2 className="editorial text-3xl sm:text-4xl">How to create your video</h2><p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">{editorial.summary}</p><ol className="mt-8 grid gap-8 md:grid-cols-2">{editorial.steps.map((step, index) => <li key={step.title}><span className="eyebrow text-primary">Step {index + 1}</span><h3 className="mt-3 text-lg font-semibold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{step.text}</p></li>)}</ol></section>}
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-2">
        <div><h2 className="text-2xl font-semibold">What you can create</h2><ul className="mt-6 space-y-4">{feature.capabilities.map((capability) => <li key={capability} className="flex gap-3 text-sm leading-7 text-muted-foreground"><Check className="mt-1 size-4 shrink-0 text-primary" />{capability}</li>)}</ul></div>
        <Card className="p-6"><div className="flex items-center gap-2 text-foreground"><TriangleAlert className="size-4 text-primary" /><h2 className="text-lg font-semibold">Know the limits before you generate</h2></div><ul className="mt-5 space-y-4">{feature.limitations.map((limitation) => <li key={limitation} className="flex gap-3 text-sm leading-7 text-muted-foreground"><Info className="mt-1 size-4 shrink-0" />{limitation}</li>)}</ul></Card>
      </section>
      {editorial && <div className="mx-auto max-w-6xl px-6 py-12"><section><h2 className="editorial text-3xl sm:text-4xl">Ideas to get you started</h2><div className="mt-8 grid gap-8 md:grid-cols-3">{editorial.useCases.map((useCase) => <div key={useCase.title}><h3 className="text-lg font-semibold">{useCase.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{useCase.text}</p></div>)}</div></section><div className="mt-16"><AnswerSection answers={editorial.faqs} /></div></div>}
      <section className="mx-auto max-w-6xl px-6 pb-20"><h2 className="text-xl font-semibold">Keep exploring</h2><div className="mt-5 flex flex-wrap gap-4">{related.map((item) => item && <Link key={item.slug} className="text-primary underline underline-offset-4" href={`/features/${item.slug}`}>{item.name}</Link>)}<Link className="text-primary underline underline-offset-4" href="/guides/faceless-videos-vs-ai-cartoons">Compare faceless videos and cartoons</Link><Link className="text-primary underline underline-offset-4" href="/contact">Ask a question</Link></div></section>
    </main>
    <SiteFooter />
  </>;
}
