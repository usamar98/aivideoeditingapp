export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const YOUTUBE_CALLBACK = "/api/social/youtube/callback";

export function youtubeConfig() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !/^[a-f\d]{64}$/i.test(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "")) throw new Error("YouTube connection is not configured yet.");
  const url = new URL(redirectUri);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.pathname !== YOUTUBE_CALLBACK || url.search || url.hash || url.username || url.password) throw new Error("YouTube callback configuration is invalid.");
  return { clientId, clientSecret, redirectUri, origin: url.origin };
}
export function youtubeConfigured() { try { youtubeConfig(); return Boolean(process.env.TRIGGER_SECRET_KEY); } catch { return false; } }
export function publicPublishingEnabled() { return process.env.YOUTUBE_PUBLIC_PUBLISHING_ENABLED === "true"; }
