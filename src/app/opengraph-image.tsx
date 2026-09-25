import { socialImage } from "@/lib/seo/social-image";

export const alt = "ETA — AI video generator for faceless videos and cartoons";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialImage("Faceless videos. AI cartoons. Your next story.", "Turn prompts or character images into videos. Review your story, generate your scenes and download a private MP4.");
}
