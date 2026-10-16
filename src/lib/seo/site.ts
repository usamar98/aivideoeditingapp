export const productionSiteUrl = "https://createaivideos.app";

export const legacySiteHosts = ["editingapp.live", "www.editingapp.live"] as const;
export const canonicalAliasHosts = [...legacySiteHosts, "www.createaivideos.app"] as const;

/** Marketing URLs must never point at localhost, a preview, or an arbitrary path. */
export function normalizeSiteUrl(value?: string): string {
  try {
    const url = new URL(value?.trim() || productionSiteUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return productionSiteUrl;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".vercel.app") || !hostname.includes(".") || /^[\d.:\[\]]+$/.test(hostname)) return productionSiteUrl;
    if (hostname === "createaivideos.app" || canonicalAliasHosts.some((host) => hostname === host)) return productionSiteUrl;
    return url.origin;
  } catch {
    return productionSiteUrl;
  }
}

/** Billing returns may use local/preview origins, but never send users back to the retired site. */
export function appSiteUrl(value?: string): string {
  try {
    const url = new URL(value?.trim() || productionSiteUrl);
    if (url.username || url.password || url.search || url.hash) return productionSiteUrl;
    if (url.hostname === "createaivideos.app" || canonicalAliasHosts.some((host) => host === url.hostname)) return productionSiteUrl;
    if (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) return url.origin;
  } catch { /* Fall through to the production origin. */ }
  return productionSiteUrl;
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
  { path: "/", title: "AI video generator", description: "Create AI short films, faceless videos, cartoons, property tours and product ads with Create AI Videos.", modifiedAt: "2026-10-16" },
  { path: "/features", title: "AI video creation tools", description: "Compare short films, faceless videos, cartoons, real estate tours, Ad Remake, photo presenters, UGC ads and podcast Shorts.", modifiedAt: "2026-10-16" },
  { path: "/pricing", title: "Plans and credits", description: "Monthly and annual prices, credits and billing questions.", modifiedAt: "2026-10-15" },
  { path: "/guides", title: "Video creation guides", description: "Practical guidance for choosing and reviewing AI video workflows.", modifiedAt: "2026-10-16" },
  { path: "/guides/how-to-make-ai-videos", title: "How to make AI videos", description: "Choose a workflow, write a focused brief, understand credits and review an AI video before export.", modifiedAt: "2026-10-16" },
  { path: "/guides/faceless-videos-vs-ai-cartoons", title: "Faceless videos vs AI cartoons", description: "Compare narrated image-based shorts with character-led AI animation.", modifiedAt: "2026-10-16" },
  { path: "/about", title: "About Create AI Videos", description: "What Create AI Videos creates, how it works and its current limitations.", modifiedAt: "2026-10-15" },
  { path: "/contact", title: "Contact Create AI Videos", description: "Get help with your account, billing or a video job.", modifiedAt: "2026-10-15" },
  { path: "/privacy", title: "Privacy Policy", description: "How Create AI Videos handles accounts, Google sign-in, creative content and privacy requests.", modifiedAt: "2026-10-15" },
  { path: "/terms", title: "Terms of Service", description: "Rules for accounts, subscriptions, credits, cancellations and AI content.", modifiedAt: "2026-10-15" },
] as const;
