import { socialImage } from "@/lib/seo/social-image";

export const alt = "ETA — AI videos, cartoons and UGC product ads";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialImage("Stories. Cartoons. Product ads.", "Create faceless videos, AI cartoons and presenter-led product ads. Review your script and download private MP4s.");
}
