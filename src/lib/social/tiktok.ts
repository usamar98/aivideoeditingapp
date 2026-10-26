import { z } from "zod";
import { TIKTOK_SCOPES, tiktokConfig } from "./tiktok-config";
import { tiktokCreatorSchema, type TikTokPublishInput } from "./tiktok-types";

export class TikTokError extends Error {
  constructor(public readonly code: "reconnect" | "unavailable" | "rejected" | "uncertain", message: string) { super(message); }
}
const opaque = z.string().min(1).max(512).regex(/^[\w.~-]+$/);
const credential = z.string().min(1).max(16384);
export const tiktokTokensSchema = z.object({ accessToken: credential, refreshToken: credential, openId: opaque,
  accessExpiresAt: z.number().int().positive(), refreshExpiresAt: z.number().int().positive(), scopes: z.array(z.string()).max(50) });
export type TikTokTokens = z.infer<typeof tiktokTokensSchema>;
const tokenResponse = z.object({ access_token: credential, refresh_token: credential, open_id: opaque,
  expires_in: z.number().int().positive().max(31_536_000), refresh_expires_in: z.number().int().positive().max(63_072_000), scope: z.string().max(2000), token_type: z.literal("Bearer") });

function providerError(code: unknown, status: number): TikTokError {
  if (status === 401 || ["access_token_invalid", "scope_not_authorized", "invalid_grant", "invalid_token"].includes(String(code))) return new TikTokError("reconnect", "TikTok access expired or was removed. Reconnect the same account.");
  if (status === 429 || status >= 500 || code === "rate_limit_exceeded" || code === "internal_error") return new TikTokError("unavailable", "TikTok is temporarily unavailable or rate limited. Check this post's status before retrying.");
  if (code === "unaudited_client_can_only_post_to_private_accounts") return new TikTokError("rejected", "TikTok requires a private account for unaudited Direct Post testing.");
  if (["spam_risk_too_many_posts", "reached_active_user_cap", "spam_risk_user_banned_from_posting"].includes(String(code))) return new TikTokError("rejected", "TikTok cannot accept more posts from this creator or app right now. Try again later.");
  if (code === "url_ownership_unverified") return new TikTokError("rejected", "The operator must verify the media domain in the TikTok developer app before publishing.");
  return new TikTokError("rejected", "TikTok rejected this request. Check app approval, creator permissions and post settings.");
}
async function request(path: string, options: RequestInit, oauth = false): Promise<unknown> {
  try {
    const response = await fetch(`https://open.tiktokapis.com${path}`, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const payload = await response.json().catch(() => null);
    const error = payload?.error, code = typeof error === "string" ? error : error?.code;
    if (!response.ok || (code !== undefined && code !== "ok")) throw providerError(code, response.status);
    if (!payload || (!oauth && code !== "ok")) throw new TikTokError("unavailable", "TikTok returned an unreadable response. Check the existing post before retrying.");
    return oauth ? payload : payload.data;
  } catch (error) {
    if (error instanceof TikTokError) throw error;
    // Never echo provider messages, URLs, authorization codes, headers or tokens.
    throw new TikTokError("unavailable", "TikTok could not be reached. Check the existing post before retrying.");
  }
}
async function api(path: string, token: string, body?: unknown) {
  return request(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new TikTokError("unavailable", "TikTok returned an unexpected response. Refresh this connection or post.");
  return result.data;
}
export function tiktokAuthorizationUrl(state: string) {
  const config = tiktokConfig(), url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({ client_key: config.clientKey, response_type: "code", scope: TIKTOK_SCOPES.join(","), redirect_uri: config.redirectUri, state, disable_auto_auth: "1" }).toString();
  return url.toString();
}
async function tokenRequest(values: Record<string, string>) {
  const config = tiktokConfig();
  const result = parse(tokenResponse, await request("/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, ...values }) }, true));
  const scopes = result.scope.split(",").map((s) => s.trim());
  if (TIKTOK_SCOPES.some((scope) => !scopes.includes(scope))) throw new TikTokError("reconnect", "Grant TikTok profile and video publishing permissions, then reconnect.");
  return { accessToken: result.access_token, refreshToken: result.refresh_token, openId: result.open_id,
    accessExpiresAt: Date.now() + result.expires_in * 1000, refreshExpiresAt: Date.now() + result.refresh_expires_in * 1000, scopes };
}
export const exchangeTikTokCode = (code: string) => tokenRequest({ code, grant_type: "authorization_code", redirect_uri: tiktokConfig().redirectUri });
export const refreshTikTokToken = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
export async function tiktokUser(token: string) {
  const payload = await request("/v2/user/info/?fields=open_id,display_name", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  return parse(z.object({ user: z.object({ open_id: opaque, display_name: z.string().min(1).max(200) }) }), payload).user;
}
export async function tiktokCreator(token: string) { return parse(tiktokCreatorSchema, await api("/v2/post/publish/creator_info/query/", token)); }
export async function revokeTikTokToken(token: string) {
  const config = tiktokConfig();
  // An expired access token is not proof that TikTok revoked the authorization.
  // Let disconnect surface an honest manual-removal warning on any failure.
  await request("/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, token }) }, true);
}
export async function initTikTokPost(token: string, post: Pick<TikTokPublishInput, "caption" | "privacy" | "allowComments" | "allowDuet" | "allowStitch" | "brandOrganic" | "brandedContent" | "syntheticMedia">, mediaUrl: string) {
  const url = new URL(mediaUrl), origin = tiktokConfig().origin;
  if (url.origin !== origin || !url.pathname.startsWith("/api/social/tiktok/media/") || !z.uuid().safeParse(url.pathname.slice("/api/social/tiktok/media/".length)).success || !/^[\w-]{43}$/.test(url.searchParams.get("ticket") || "") || url.searchParams.getAll("ticket").length !== 1 || url.username || url.password || url.hash || [...url.searchParams.keys()].some((key) => key !== "ticket")) throw new TikTokError("rejected", "Invalid TikTok media destination.");
  return parse(z.object({ publish_id: z.string().min(1).max(128).regex(/^[\w.~-]+$/) }), await api("/v2/post/publish/video/init/", token, {
    post_info: { title: post.caption, privacy_level: post.privacy, disable_comment: !post.allowComments, disable_duet: !post.allowDuet, disable_stitch: !post.allowStitch,
      brand_organic_toggle: post.brandOrganic, brand_content_toggle: post.brandedContent, is_aigc: post.syntheticMedia },
    source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
  })).publish_id;
}
export async function tiktokPostStatus(token: string, publishId: string) {
  const id = parse(z.string().min(1).max(128).regex(/^[\w.~-]+$/), publishId);
  const result = parse(z.object({ status: z.enum(["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "SEND_TO_USER_INBOX", "PUBLISH_COMPLETE", "FAILED"]),
    publicaly_available_post_id: z.array(z.unknown()).max(100).optional() }), await api("/v2/post/publish/status/fetch/", token, { publish_id: id }));
  // JSON numeric int64 IDs can already be rounded by JSON.parse. Never create a
  // link from an unsafe number, and never expose raw provider failure reasons.
  const publicIds = (result.publicaly_available_post_id || []).filter((v) => typeof v === "string" && /^\d{1,40}$/.test(v) || typeof v === "number" && Number.isSafeInteger(v) && v >= 0).map(String);
  return { status: result.status, publicIds };
}
