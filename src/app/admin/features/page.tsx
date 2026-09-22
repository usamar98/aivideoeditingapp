import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BrandMark } from "@/components/studio/brand-mark";
import { FeatureAdmin } from "@/components/studio/feature-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { featureCatalog } from "@/lib/features/catalog";
import { featureFromRow } from "@/lib/features/repository";
import { isFixtureMode } from "@/lib/integrations";
import { canManageFeatures, createClient, getViewer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Feature publishing", robots: { index: false, follow: false } };

export default async function FeatureAdminPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin/features");
  if (!(await canManageFeatures())) notFound();
  const client = await createClient();
  const { data } = client ? await client.from("feature_content").select("*").order("name") : { data: null };
  const stored = (data || []).map((row) => featureFromRow(row)).filter((feature) => feature !== null);
  const bySlug = new Map(featureCatalog.map((feature) => [feature.slug, feature]));
  stored.forEach((feature) => bySlug.set(feature.slug, feature));
  return <main className="min-h-screen"><header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-8"><Link href="/"><BrandMark /></Link><div className="flex items-center gap-2"><Badge variant="warning">Admin preview</Badge><Button asChild variant="outline" size="sm"><Link href="/features">View catalog</Link></Button></div></header><section className="mx-auto max-w-[96rem] p-5 sm:p-8"><div className="mb-6"><h1 className="text-2xl font-bold tracking-tight">Feature publishing</h1><p className="mt-1 text-sm text-muted-foreground">Preview, edit, publish, and retire feature content without separate SEO templates.</p></div><FeatureAdmin initialFeatures={[...bySlug.values()]} fixtureMode={isFixtureMode()} /></section></main>;
}
