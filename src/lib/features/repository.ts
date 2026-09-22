import "server-only";

import { createClient } from "@supabase/supabase-js";

import { featureCatalog, featureDefinitionSchema, getFeature, getPublishedFeatures, type FeatureDefinition } from "./catalog";

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function featureFromRow(row: Record<string, unknown>): FeatureDefinition | null {
  const content = typeof row.content === "object" && row.content ? row.content : {};
  const parsed = featureDefinitionSchema.safeParse({
    ...content,
    slug: row.slug,
    name: row.name,
    status: row.status,
    seo: row.seo,
    developmentOnly: row.development_only,
    publishedAt: row.published_at,
    modifiedAt: row.modified_at,
  });
  return parsed.success ? parsed.data : null;
}

export async function getPublishedFeaturesData() {
  const client = createPublicClient();
  if (!client) return getPublishedFeatures();
  const { data, error } = await client.from("feature_content").select("*").eq("status", "published").eq("development_only", false).order("name");
  if (error || !data) return getPublishedFeatures();
  const parsed = data.map((row) => featureFromRow(row)).filter((item): item is FeatureDefinition => Boolean(item));
  return parsed.length > 0 ? parsed : getPublishedFeatures();
}

export async function getFeatureData(slug: string) {
  const client = createPublicClient();
  if (!client) return getFeature(slug);
  const { data, error } = await client.from("feature_content").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return getFeature(slug);
  return featureFromRow(data) || getFeature(slug);
}

export async function getStaticFeatureSlugs() {
  const features = await getPublishedFeaturesData();
  const slugs = new Set([...featureCatalog.filter((item) => item.developmentOnly).map((item) => item.slug), ...features.map((item) => item.slug)]);
  return [...slugs];
}
