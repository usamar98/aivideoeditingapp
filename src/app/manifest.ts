import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: "/studio",
    scope: "/",
    display: "standalone",
    background_color: "#faf7ef",
    theme_color: "#2457d6",
    icons: [192, 512].map((size) => ({
      src: `/brand/create-ai-videos-icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
