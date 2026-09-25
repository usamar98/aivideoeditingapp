import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

import { canIndexFeature, featureDefinitionSchema, getPublishedFeatures, type FeatureDefinition } from "./catalog";

const catalogColumns = "slug,name,status,seo,content,development_only,published_at,modified_at";
const catalogUnavailable = "The published feature catalog is unavailable. Please try again.";

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

// Request-local memoization keeps page content, metadata and related links on the
// same publication snapshot without persisting retired content between requests.
export const getPublishedFeaturesData = cache(async (): Promise<FeatureDefinition[]> => {
  try {
    const admin = createAdminClient();
    const client = admin ?? createPublicClient();
    if (!client) {
      const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY);
      if (configured) throw new Error(catalogUnavailable);
      return getPublishedFeatures();
    }

    // Anonymous RLS hides retired/draft rows. Only an authoritative server-side
    // read can prove a built-in feature has never been overridden in the CMS.
    let query = client.from("feature_content").select(catalogColumns, { count: "exact" }).order("slug").limit(1000);
    if (!admin) query = query.eq("status", "published").eq("development_only", false);
    const { data, error, count } = await query;
    // Never infer absence from a failed, incomplete or truncated response: doing
    // so could resurrect an unpublished built-in in pages and the sitemap.
    if (error || !Array.isArray(data) || count !== data.length) throw new Error(catalogUnavailable);

    const published = data.map((row) => featureFromRow(row)).filter(
      (feature): feature is FeatureDefinition => feature !== null && canIndexFeature(feature),
    );
    if (!admin) return published;

    // Even a malformed stored override suppresses the static version. Hidden
    // records are used only as tombstones and never returned to public routes.
    const storedSlugs = new Set(data.map((row) => row.slug));
    return [...getPublishedFeatures().filter((feature) => !storedSlugs.has(feature.slug)), ...published];
  } catch {
    // Do not expose provider errors, private content or connection details, and
    // do not let a transient failure become a successful empty SEO response.
    throw new Error(catalogUnavailable);
  }
});

export const getFeatureData = cache(async (slug: string): Promise<FeatureDefinition | undefined> => {
  return (await getPublishedFeaturesData()).find((feature) => feature.slug === slug);
});

export async function getStaticFeatureSlugs() {
  const features = await getPublishedFeaturesData();
  return features.map((feature) => feature.slug);
}
