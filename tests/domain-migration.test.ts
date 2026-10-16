import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { appSiteUrl, canonicalAliasHosts, normalizeSiteUrl, productionSiteUrl } from "@/lib/seo/site";
import { rebrandFeatureSeo, rebrandPublicCopy } from "@/lib/seo/rebrand";
import manifest from "@/app/manifest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Create AI Videos domain migration", () => {
  it.each([
    "https://editingapp.live", "https://www.editingapp.live/pricing?plan=growth",
    "https://www.createaivideos.app", "https://createaivideos.app/terms",
  ])("does not leak a retired or duplicate origin from %s", (value) => {
    expect(normalizeSiteUrl(value)).toBe("https://createaivideos.app");
    expect(appSiteUrl(value)).toBe(productionSiteUrl);
  });

  it("preserves explicit local and preview checkout return origins", () => {
    expect(appSiteUrl("http://localhost:3001/studio")).toBe("http://localhost:3001");
    expect(appSiteUrl("https://preview-example.vercel.app")).toBe("https://preview-example.vercel.app");
    expect(appSiteUrl("javascript:alert(1)")).toBe(productionSiteUrl);
    expect(appSiteUrl("https://user:password@example.com")).toBe(productionSiteUrl);
    expect(appSiteUrl()).toBe(productionSiteUrl);
  });

  it("migrates stale public environment overrides without changing credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.editingapp.live");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@editingapp.live");
    const { brand } = await import("@/config/brand");
    expect(brand.siteUrl).toBe(productionSiteUrl);
    expect(brand.appUrl).toBe(productionSiteUrl);
    expect(brand.supportEmail).toBe("support@createaivideos.app");
  });

  it("only redirects known alias hosts and leaves provider endpoints in place", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toHaveLength(canonicalAliasHosts.length);
    for (const [index, redirect] of redirects.entries()) {
      expect(redirect.permanent).toBe(true);
      expect(redirect.destination).toBe(`${productionSiteUrl}/:path`);
      const hostRule = redirect.has?.find((rule) => rule.type === "host");
      const host = new RegExp(`^${hostRule?.value}$`);
      expect(host.test(canonicalAliasHosts[index])).toBe(true);
      expect(host.test("createaivideos.app")).toBe(false);
      expect(host.test("unrelated.example")).toBe(false);
      const paths = new RegExp(`^${redirect.source.replace("/:path(", "/(?:")}$`);
      for (const path of ["/", "/features/ai-short-film-generator", "/pricing", "/studio"]) expect(paths.test(path)).toBe(true);
      for (const path of ["/api", "/api/webhooks/stripe", "/api/social/facebook/callback", "/auth/callback", "/_next/static/file.js"]) expect(paths.test(path)).toBe(false);
    }
  });

  it("rebrands nested legacy CMS copy without mutating the stored row", () => {
    const row = { slug: "ai-short-film-generator", status: "published", description: "ETA uses https://www.editingapp.live", benefits: ["Editing App tools"], privateId: "framefoundry_creator_month_v2" };
    const result = rebrandPublicCopy(row);
    expect(result).toEqual({ ...row, description: "Create AI Videos uses https://createaivideos.app", benefits: ["Create AI Videos tools"] });
    expect(row.description).toContain("ETA");
    expect((result as typeof row).privateId).toBe(row.privateId);
  });

  it("keeps migrated CMS SEO inside the feature validation limits", () => {
    const seo = rebrandFeatureSeo({ title: "AI Short Film Generator — Story to Cinematic Video", description: `${"Creative tools ".repeat(11)} ETA` }) as { title: string; description: string };
    expect(seo.title).toBe("AI Short Film Generator");
    expect(seo.description.length).toBeLessThanOrEqual(165);
    expect(seo.description).not.toMatch(/\bETA\b/);
  });

  it("uses the new brand in installable app metadata", () => {
    const app = manifest();
    expect(app.name).toBe("Create AI Videos");
    expect(app.short_name).toBe("Create AI");
    expect(app.icons?.map((icon) => icon.src)).toEqual(["/brand/create-ai-videos-icon-192.png?v=cav-20261016", "/brand/create-ai-videos-icon-512.png?v=cav-20261016"]);
    expect(app.start_url).toBe("/studio");
  });
});
