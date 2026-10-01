import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FACEBOOK_SCOPES, facebookConfig } from "./facebook-config";

const idSchema = z.string().regex(/^\d{1,40}$/);
const pageSchema = z.object({ id: idSchema, name: z.string().max(500), access_token: z.string().min(1), tasks: z.array(z.string()) });
export type FacebookPage = z.infer<typeof pageSchema>;
export const facebookGrantSchema = z.object({ userId: idSchema, token: z.string().min(1), pages: z.array(pageSchema).max(500) });
export class FacebookError extends Error {
  constructor(public readonly code: "reconnect" | "unavailable" | "rejected" | "uncertain", message: string) { super(message); }
}
export function facebookIdentityHash(id: string) { return createHmac("sha256", facebookConfig().appSecret).update(`facebook-user:${id}`).digest("hex"); }
export function appSecretProof(token: string) { return createHmac("sha256", facebookConfig().appSecret).update(token).digest("hex"); }

async function request(url: string, options: RequestInit = {}) {
  const signal = AbortSignal.timeout(60_000);
  try {
    const response = await fetch(url, { ...options, signal, redirect: "error", cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      if (data?.error?.code === 190 || response.status === 401) throw new FacebookError("reconnect", "Facebook access expired or was removed. Reconnect the same Page.");
      if (response.status >= 500 || response.status === 429 || data?.error?.is_transient) throw new FacebookError("unavailable", "Facebook is temporarily unavailable. Check this post's status before retrying.");
      throw new FacebookError("rejected", "Facebook rejected the request. Check Page access, app permissions and the video in Meta Business Suite.");
    }
    if (!data) throw new FacebookError("unavailable", "Facebook returned an unreadable response. Check this post's status.");
    return data;
  } catch (error) {
    if (error instanceof FacebookError) throw error;
    // Provider errors, request URLs and tokens must not be echoed to logs or users.
    throw new FacebookError("unavailable", "Facebook could not be reached. Check this post's status before retrying.");
  }
}
async function graph(path: string, token: string, values: Record<string, string> = {}, method = "GET") {
  const config = facebookConfig(), url = new URL(`https://graph.facebook.com/${config.version}/${path}`);
  const params = new URLSearchParams({ ...values, appsecret_proof: appSecretProof(token) });
  if (method === "GET") url.search = params.toString();
  return request(url.toString(), { method, headers: { Authorization: `Bearer ${token}` }, ...(method !== "GET" ? { body: params } : {}) });
}
export function facebookAuthorizationUrl(state: string) {
  const config = facebookConfig(), url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.redirectUri, state, response_type: "code", scope: FACEBOOK_SCOPES.join(","), auth_type: "rerequest" }).toString();
  return url.toString();
}
export async function exchangeFacebookCode(code: string) {
  const config = facebookConfig();
  async function exchange(values: Record<string, string>) {
    const url = new URL(`https://graph.facebook.com/${config.version}/oauth/access_token`);
    // Meta's documented token exchange is a GET. This URL is never logged/returned.
    url.search = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, ...values }).toString();
    return z.object({ access_token: z.string().min(1) }).parse(await request(url.toString())).access_token;
  }
  const short = await exchange({ redirect_uri: config.redirectUri, code });
  return exchange({ grant_type: "fb_exchange_token", fb_exchange_token: short });
}
export async function loadFacebookGrant(token: string) {
  const me = z.object({ id: idSchema }).parse(await graph("me", token, { fields: "id" }));
  const permissions = z.object({ data: z.array(z.object({ permission: z.string(), status: z.string() })) }).parse(await graph("me/permissions", token));
  if (FACEBOOK_SCOPES.some((scope) => !permissions.data.some((permission) => permission.permission === scope && permission.status === "granted"))) {
    throw new FacebookError("rejected", "Allow Page listing, Page read access and Page publishing, then reconnect.");
  }
  const pages: FacebookPage[] = []; let after: string | undefined;
  for (let batch = 0; batch < 5; batch++) {
    const result = z.object({ data: z.array(pageSchema), paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string() }).optional() }).optional() })
      .parse(await graph("me/accounts", token, { fields: "id,name,access_token,tasks", limit: "100", ...(after ? { after } : {}) }));
    pages.push(...result.data.filter((page) => page.tasks.some((task) => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(task))));
    if (!result.paging?.next) return { userId: me.id, token, pages };
    after = result.paging.cursors?.after;
    if (!after || batch === 4) throw new FacebookError("rejected", "Too many Pages were returned. Reconnect and grant ETA access to fewer Pages.");
  }
  return { userId: me.id, token, pages };
}
export async function verifyFacebookPage(token: string, id: string) {
  const page = z.object({ id: idSchema, name: z.string() }).parse(await graph("me", token, { fields: "id,name" }));
  if (page.id !== id) throw new FacebookError("reconnect", "Reconnect the original Facebook Page.");
  return page;
}
export async function revokeFacebookGrant(token: string) {
  try { const data = await graph("me/permissions", token, {}, "DELETE"); if (data.success !== true) throw new Error("Not confirmed"); }
  catch (error) { if (!(error instanceof FacebookError && error.code === "reconnect")) throw error; }
}
export async function createFacebookReel(token: string, pageId: string) {
  idSchema.parse(pageId);
  const data = z.object({ video_id: idSchema, upload_url: z.string() }).parse(await graph(`${pageId}/video_reels`, token, { upload_phase: "start" }, "POST"));
  const expected = `https://rupload.facebook.com/video-upload/${facebookConfig().version}/${data.video_id}`;
  if (data.upload_url !== expected) throw new FacebookError("rejected", "Facebook returned an unexpected upload destination.");
  return data.video_id;
}
export async function uploadFacebookReel(token: string, videoId: string, signedUrl: string) {
  idSchema.parse(videoId);
  const url = new URL(signedUrl), storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (url.protocol !== "https:" || url.origin !== storage.origin || !url.pathname.startsWith("/storage/v1/object/sign/private-media/") || url.username || url.password || url.hash) throw new Error("Invalid private media URL");
  const result = await request(`https://rupload.facebook.com/video-upload/${facebookConfig().version}/${videoId}`, {
    method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: signedUrl },
  });
  if (result.success !== true) throw new FacebookError("unavailable", "Facebook did not confirm media transfer. Refresh this post's status.");
}
export type FacebookReelStatus = { id: string; status: { video_status: string; uploading_phase?: { status: string }; processing_phase?: { status: string }; publishing_phase?: { status: string } } };
export async function facebookReelStatus(token: string, videoId: string): Promise<FacebookReelStatus> {
  idSchema.parse(videoId);
  const phase = z.object({ status: z.string() });
  const result = z.object({ id: idSchema, status: z.object({ video_status: z.string(), uploading_phase: phase.optional(), processing_phase: phase.optional(), publishing_phase: phase.optional() }) })
    .parse(await graph(videoId, token, { fields: "status" }));
  if (result.id !== videoId) throw new Error("Unexpected Reel status");
  return result;
}
export async function finishFacebookReel(token: string, pageId: string, videoId: string, title: string, description: string) {
  idSchema.parse(pageId); idSchema.parse(videoId);
  const result = await graph(`${pageId}/video_reels`, token, { video_id: videoId, upload_phase: "finish", video_state: "PUBLISHED", title, description }, "POST");
  if (result.success !== true) throw new FacebookError("uncertain", "Facebook has not confirmed publication. Check Meta Business Suite before trying another upload.");
}

export function parseFacebookSignedRequest(raw: string) {
  if (raw.length > 12000) throw new Error("Invalid signed request");
  const [signature, payload, extra] = raw.split(".");
  if (!signature || !payload || extra || !/^[\w-]+$/.test(signature) || !/^[\w-]+$/.test(payload)) throw new Error("Invalid signed request");
  const expected = createHmac("sha256", facebookConfig().appSecret).update(payload).digest(), actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid signature");
  const data = z.object({ algorithm: z.literal("HMAC-SHA256"), user_id: idSchema, issued_at: z.number().int() }).parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (data.issued_at > Date.now() / 1000 + 300) throw new Error("Invalid issue time");
  // Authentic replayed deletion requests are safe and idempotent; do not reject delayed Meta deliveries.
  return data;
}
