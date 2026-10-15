import type { NextConfig } from "next";
import { canonicalAliasHosts, indexableDeployment, privateCrawlerPaths, productionSiteUrl } from "./src/lib/seo/site";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  redirects() {
    return canonicalAliasHosts.map((host) => ({
      // Keep API/webhook and OAuth endpoints working during the cutover. Never
      // forward authorization codes or signed provider requests across domains.
      source: "/:path((?!api(?:/|$)|auth(?:/|$)|_next(?:/|$)).*)",
      has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
      destination: `${productionSiteUrl}/:path`,
      permanent: true,
    }));
  },
  headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ] },
      ...[...privateCrawlerPaths, "/login"].map((path) => ({ source: `${path}/:path*`, headers: noindex })),
      ...(!indexableDeployment() ? [{ source: "/:path*", headers: noindex }] : []),
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
