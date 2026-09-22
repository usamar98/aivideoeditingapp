import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/studio/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublishedFeaturesData } from "@/lib/features/repository";

export const metadata: Metadata = {
  title: "AI video creation features",
  description: "Explore published AI video creation workflows. Unreleased and retired capabilities are excluded automatically.",
  alternates: { canonical: "/features" },
};

export default async function FeaturesPage() {
  const features = await getPublishedFeaturesData();
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8"><Link href="/"><BrandMark /></Link><Button asChild size="sm"><Link href="/studio">Open studio</Link></Button></header>
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <Badge variant="outline">Published catalog</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Video workflows built on one reusable foundation.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Each feature has its own approved facts, audience, limitations, metadata, related links, and publication state.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {features.map((feature) => <Card key={feature.slug}><CardHeader><CardTitle>{feature.name}</CardTitle><CardDescription>{feature.description}</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href={`/features/${feature.slug}`}>Explore feature <ArrowRight /></Link></Button></CardContent></Card>)}
        </div>
      </section>
    </main>
  );
}
