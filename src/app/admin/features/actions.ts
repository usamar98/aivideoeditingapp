"use server";

import { revalidatePath } from "next/cache";

import { featureDefinitionSchema } from "@/lib/features/catalog";
import { isFixtureMode } from "@/lib/integrations";
import { canManageFeatures, createClient } from "@/lib/supabase/server";

export async function saveFeatureAction(input: unknown) {
  const feature = featureDefinitionSchema.parse(input);
  if (!(await canManageFeatures())) return { ok: false as const, error: "Administrator access is required." };
  if (isFixtureMode()) return { ok: true as const, fixture: true as const };

  const client = await createClient();
  if (!client) return { ok: false as const, error: "Supabase is not configured." };
  const { audience, benefits, capabilities, description, exampleMedia, limitations, relatedFeatures, searchIntent } = feature;
  const { error } = await client.from("feature_content").upsert({
    slug: feature.slug,
    name: feature.name,
    status: feature.status,
    development_only: feature.developmentOnly,
    published_at: feature.publishedAt,
    modified_at: feature.modifiedAt,
    seo: feature.seo,
    content: { audience, benefits, capabilities, description, exampleMedia, limitations, relatedFeatures, searchIntent },
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/features");
  revalidatePath("/");
  revalidatePath("/llms.txt");
  revalidatePath("/features/[slug]", "page");
  revalidatePath(`${feature.seo.canonicalPath}/opengraph-image`);
  revalidatePath(feature.seo.canonicalPath);
  revalidatePath("/sitemap.xml");
  return { ok: true as const, fixture: false as const };
}
