import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), publicClient: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.publicClient }));

import { featureCatalog, getPublishedFeatures, type FeatureDefinition } from "@/lib/features/catalog";
import { getFeatureData, getPublishedFeaturesData, getStaticFeatureSlugs } from "@/lib/features/repository";

const cartoon = featureCatalog.find((feature) => feature.slug === "ai-cartoon-series")!;
const builtInSlugs = getPublishedFeatures().map((feature) => feature.slug);
const unavailable = "The published feature catalog is unavailable. Please try again.";

function toRow(feature: FeatureDefinition) {
  const { slug, name, status, seo, developmentOnly, publishedAt, modifiedAt, ...content } = feature;
  return { slug, name, status, seo, development_only: developmentOnly, published_at: publishedAt, modified_at: modifiedAt, content };
}

function result(rows: Record<string, unknown>[]) {
  return { data: rows, error: null, count: rows.length };
}

function client() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => mocks.read().then(resolve, reject),
  };
  return { from: vi.fn(() => query), query };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://catalog.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  mocks.admin.mockReturnValue(client());
  mocks.publicClient.mockReturnValue(client());
  mocks.read.mockResolvedValue(result([]));
});

afterEach(() => vi.unstubAllEnvs());

describe("public feature publication", () => {
  it("keeps published built-ins for an authoritative empty bootstrap", async () => {
    expect((await getPublishedFeaturesData()).map((feature) => feature.slug)).toEqual(builtInSlugs);
    expect(await getFeatureData(cartoon.slug)).toEqual(cartoon);
    expect(await getStaticFeatureSlugs()).toEqual(builtInSlugs);
    expect(mocks.publicClient).not.toHaveBeenCalled();
  });

  it.each(["draft", "retired", "unavailable"] as const)("a stored %s override suppresses the built-in everywhere", async (status) => {
    mocks.read.mockResolvedValue(result([toRow({ ...cartoon, status })]));
    expect((await getPublishedFeaturesData()).map((feature) => feature.slug)).not.toContain(cartoon.slug);
    expect(await getFeatureData(cartoon.slug)).toBeUndefined();
    expect(await getStaticFeatureSlugs()).not.toContain(cartoon.slug);
  });

  it("never returns a development-only stored override", async () => {
    mocks.read.mockResolvedValue(result([toRow({ ...cartoon, developmentOnly: true })]));
    expect(await getFeatureData(cartoon.slug)).toBeUndefined();
    expect(await getStaticFeatureSlugs()).not.toContain(cartoon.slug);
  });

  it("a malformed stored row suppresses its valid static fallback", async () => {
    mocks.read.mockResolvedValue(result([{ ...toRow(cartoon), seo: null }]));
    expect(await getFeatureData(cartoon.slug)).toBeUndefined();
    expect(await getStaticFeatureSlugs()).not.toContain(cartoon.slug);
  });

  it("uses a valid published override rather than duplicate static content", async () => {
    const edited = { ...cartoon, name: "Updated cartoon feature" };
    mocks.read.mockResolvedValue(result([toRow(edited)]));
    const published = await getPublishedFeaturesData();
    expect(published.filter((feature) => feature.slug === cartoon.slug)).toEqual([edited]);
    expect(await getFeatureData(cartoon.slug)).toEqual(edited);
  });

  it("publishes a valid custom feature alongside truly absent built-ins", async () => {
    const custom = { ...cartoon, slug: "custom-video-tool", name: "Custom video tool", seo: { ...cartoon.seo, canonicalPath: "/features/custom-video-tool" } };
    mocks.read.mockResolvedValue(result([toRow(custom)]));
    expect((await getPublishedFeaturesData()).map((feature) => feature.slug)).toEqual([...builtInSlugs, custom.slug]);
    expect(await getFeatureData(custom.slug)).toEqual(custom);
    expect(await getStaticFeatureSlugs()).toContain(custom.slug);
  });

  it("uses only anonymous published rows when the authoritative client is unavailable", async () => {
    mocks.admin.mockReturnValue(null);
    const anonymous = client();
    mocks.publicClient.mockReturnValue(anonymous);
    mocks.read.mockResolvedValue(result([toRow(cartoon)]));
    expect(await getPublishedFeaturesData()).toEqual([cartoon]);
    expect(await getFeatureData("faceless-video-generator")).toBeUndefined();
    expect(anonymous.query.eq).toHaveBeenCalledWith("status", "published");
    expect(anonymous.query.eq).toHaveBeenCalledWith("development_only", false);
  });

  it("does not revive built-ins from an anonymous empty response", async () => {
    mocks.admin.mockReturnValue(null);
    expect(await getPublishedFeaturesData()).toEqual([]);
    expect(await getFeatureData(cartoon.slug)).toBeUndefined();
    expect(await getStaticFeatureSlugs()).toEqual([]);
  });

  it("filters hidden records defensively even if an anonymous response includes them", async () => {
    mocks.admin.mockReturnValue(null);
    mocks.read.mockResolvedValue(result([toRow({ ...cartoon, status: "draft" })]));
    expect(await getPublishedFeaturesData()).toEqual([]);
  });

  it("permits static defaults only when Supabase is completely unconfigured", async () => {
    mocks.admin.mockReturnValue(null);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(await getPublishedFeaturesData()).toEqual(getPublishedFeatures());
    expect(await getFeatureData("ecommerce-product-videos")).toBeUndefined();
    expect(await getStaticFeatureSlugs()).not.toContain("ecommerce-product-videos");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("fails closed for incomplete provider configuration", async () => {
    mocks.admin.mockReturnValue(null);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(getPublishedFeaturesData()).rejects.toThrow(unavailable);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([true, false])("throws rather than caching empty/stale output after a database error (admin=%s)", async (admin) => {
    if (!admin) mocks.admin.mockReturnValue(null);
    mocks.read.mockResolvedValue({ data: null, error: { message: "private-provider-details" }, count: null });
    await expect(getPublishedFeaturesData()).rejects.toThrow(unavailable);
    await expect(getFeatureData(cartoon.slug)).rejects.toThrow(unavailable);
    await expect(getStaticFeatureSlugs()).rejects.toThrow(unavailable);
  });

  it("sanitizes rejected connection errors without publishing fallback content", async () => {
    mocks.read.mockRejectedValue(new Error("private-connection-secret"));
    await expect(getPublishedFeaturesData()).rejects.toThrow(unavailable);
  });

  it.each([
    { data: null, error: null, count: 0 },
    { data: [], error: null, count: null },
    { data: [], error: null, count: 1 },
  ])("rejects incomplete responses before inferring that overrides are absent", async (response) => {
    mocks.read.mockResolvedValue(response);
    await expect(getPublishedFeaturesData()).rejects.toThrow(unavailable);
  });

  it("bounds reads and requests an exact count so truncation cannot revive hidden defaults", async () => {
    const authoritative = client();
    mocks.admin.mockReturnValue(authoritative);
    await getPublishedFeaturesData();
    expect(authoritative.from).toHaveBeenCalledWith("feature_content");
    expect(authoritative.query.select).toHaveBeenCalledWith(expect.not.stringContaining("*"), { count: "exact" });
    expect(authoritative.query.limit).toHaveBeenCalledWith(1000);
    expect(authoritative.query.eq).not.toHaveBeenCalled();
  });
});
