import { normalizeSiteUrl } from "@/lib/seo/site";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export const brand = {
  name: "ETA",
  shortName: "ETA",
  description:
    "Create faceless videos and AI cartoons from prompts or character images. Review scripts, scenes and dialogue, then generate and download your video with ETA.",
  siteUrl: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  // Preserve the configured local/preview origin for operational billing returns.
  appUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  googleSiteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  bingSiteVerification: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
  supportEmail: supportEmail && !supportEmail.endsWith("@example.com") ? supportEmail : "support@editingapp.live",
} as const;
