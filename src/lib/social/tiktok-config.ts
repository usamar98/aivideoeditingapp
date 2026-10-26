export const TIKTOK_CALLBACK = "/api/social/tiktok/callback";
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;

export function tiktokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "", clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || "";
  if (!clientKey || !clientSecret || !/^[a-f\d]{64}$/i.test(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "")) throw new Error("TikTok is not configured.");
  const url = new URL(redirectUri);
  if (url.protocol !== "https:" || url.pathname !== TIKTOK_CALLBACK || url.search || url.hash || url.username || url.password || url.port) throw new Error("TikTok requires an exact HTTPS callback.");
  return { clientKey, clientSecret, redirectUri, origin: url.origin };
}
export function tiktokConfigured() { try { tiktokConfig(); return Boolean(process.env.TRIGGER_SECRET_KEY); } catch { return false; } }
export const tiktokPublishingEnabled = () => process.env.TIKTOK_PUBLISHING_ENABLED === "true";
// Set only after TikTok approves the Direct Post audit. Not an approval bypass.
export const tiktokPublicPostingEnabled = () => process.env.TIKTOK_PUBLIC_POSTING_ENABLED === "true";
