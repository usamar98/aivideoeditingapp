import type { NextConfig } from "next";
import { indexableDeployment, privateCrawlerPaths } from "./src/lib/seo/site";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
