const configuredName = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim();

export const brand = {
  name: configuredName || "FrameFoundry",
  shortName: configuredName?.slice(0, 2).toUpperCase() || "FF",
  description:
    "Create short animated series with reusable characters, voices, and story worlds.",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  googleSiteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
} as const;
