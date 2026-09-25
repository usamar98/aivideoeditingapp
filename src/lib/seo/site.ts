export const productionSiteUrl = "https://www.editingapp.live";

/** Marketing URLs must never point at localhost, a preview, or an arbitrary path. */
export function normalizeSiteUrl(value?: string): string {
  try {
    const url = new URL(value?.trim() || productionSiteUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return productionSiteUrl;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".vercel.app") || !hostname.includes(".") || /^[\d.:\[\]]+$/.test(hostname)) return productionSiteUrl;
    if (hostname === "editingapp.live" || hostname === "www.editingapp.live") return productionSiteUrl;
    return url.origin;
  } catch {
    return productionSiteUrl;
  }
}

export function indexableDeployment(env: { VERCEL_ENV?: string; NODE_ENV?: string; NEXT_PUBLIC_DEMO_MODE?: string } = process.env): boolean {
  if (env.NEXT_PUBLIC_DEMO_MODE === "true") return false;
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}

export const privateCrawlerPaths = ["/studio", "/admin", "/api", "/auth"];

/** Only local, canonical page paths belong in discovery files and structured data. */
export function isPublicPath(path: string): boolean {
  return /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(path)
    && ![...privateCrawlerPaths, "/login"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Change these only when the corresponding public content is materially edited.
export const publicPages = [
  { path: "/", title: "AI video generator", description: "Create faceless videos, AI cartoons and UGC product ads with ETA.", modifiedAt: "2026-09-25" },
  { path: "/features", title: "AI video creation tools", description: "Compare ETA's faceless video, cartoon and UGC ad workflows.", modifiedAt: "2026-09-25" },
  { path: "/pricing", title: "Plans and credits", description: "Monthly and annual prices, credits and billing questions.", modifiedAt: "2026-09-25" },
  { path: "/guides", title: "Video creation guides", description: "Practical guidance for choosing and reviewing AI video workflows.", modifiedAt: "2026-09-25" },
  { path: "/guides/faceless-videos-vs-ai-cartoons", title: "Faceless videos vs AI cartoons", description: "Compare narrated image-based shorts with character-led AI animation.", modifiedAt: "2026-09-25" },
  { path: "/about", title: "About ETA", description: "What ETA creates, how it works and its current limitations.", modifiedAt: "2026-09-25" },
  { path: "/contact", title: "Contact ETA", description: "Get help with your account, billing or a video job.", modifiedAt: "2026-09-25" },
] as const;
