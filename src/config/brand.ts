import { appSiteUrl, normalizeSiteUrl } from "@/lib/seo/site";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export const brand = {
  name: "Create AI Videos",
  shortName: "Create AI",
  description:
    "Create AI videos, short films, cartoons and product ads in one studio. Review your story, choose a model and export videos with Create AI Videos.",
  siteUrl: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  // Preserve the configured local/preview origin for operational billing returns.
  appUrl: appSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  googleSiteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  bingSiteVerification: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
  supportEmail: supportEmail && !supportEmail.endsWith("@example.com") && supportEmail.toLowerCase() !== "support@editingapp.live" ? supportEmail : "support@createaivideos.app",
} as const;
