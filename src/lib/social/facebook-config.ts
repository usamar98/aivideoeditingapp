export const FACEBOOK_CALLBACK = "/api/social/facebook/callback";
export const FACEBOOK_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"] as const;

export function facebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID || "", appSecret = process.env.FACEBOOK_APP_SECRET || "";
  const version = process.env.FACEBOOK_GRAPH_VERSION || "", redirectUri = process.env.FACEBOOK_REDIRECT_URI || "";
  if (!/^\d+$/.test(appId) || !appSecret || !/^v\d+\.0$/.test(version) || !/^[a-f\d]{64}$/i.test(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "")) {
    throw new Error("Facebook is not configured yet.");
  }
  const url = new URL(redirectUri);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.pathname !== FACEBOOK_CALLBACK || url.search || url.hash || url.username || url.password) {
    throw new Error("Facebook callback configuration is invalid.");
  }
  return { appId, appSecret, version, redirectUri, origin: url.origin };
}
export function facebookConfigured() { try { facebookConfig(); return Boolean(process.env.TRIGGER_SECRET_KEY); } catch { return false; } }
export function facebookPublishingEnabled() { return process.env.FACEBOOK_PUBLISHING_ENABLED === "true"; }
