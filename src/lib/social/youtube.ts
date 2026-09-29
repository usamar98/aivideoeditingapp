import { youtubeConfig, YOUTUBE_SCOPE } from "./config";

export class YouTubeError extends Error {
  constructor(public readonly code: "reconnect" | "quota" | "rejected" | "unavailable" | "missing" | "session", message: string) { super(message); }
}
async function request(url: string, options: RequestInit = {}, resumableUpload = false) {
  const deadline = AbortSignal.timeout(60_000);
  // YouTube uses HTTP 308 as "Resume Incomplete", including for empty status
  // probes. Fetch's "error" policy rejects it before uploadPart can read Range.
  // "manual" exposes that response but never follows Location or forwards
  // credentials. Keep all non-upload requests on the strict redirect policy.
  try { return await fetch(url, { ...options, redirect: resumableUpload ? "manual" : "error", cache: "no-store", signal: deadline }); }
  catch { throw new YouTubeError("unavailable", "YouTube could not be reached. Retry safely from this upload."); }
}
async function check(response: Response) {
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const reason = body.error?.errors?.[0]?.reason;
  if (response.status === 401 || body.error === "invalid_grant") throw new YouTubeError("reconnect", "YouTube access expired or was revoked. Reconnect the same channel.");
  if (response.status === 429 || reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new YouTubeError("quota", "YouTube API quota is exhausted. Try again after it resets.");
  if (response.status === 404) throw new YouTubeError("missing", "This video is no longer available on YouTube. Check YouTube Studio.");
  if (response.status >= 500) throw new YouTubeError("unavailable", "YouTube is temporarily unavailable. Retry this upload.");
  // Provider text can contain identifiers or credentials; never expose/log it.
  throw new YouTubeError("rejected", "YouTube rejected this request. Check channel permissions, upload limits and the app’s API approval in YouTube Studio / Google Cloud.");
}
export function authorizationUrl(state: string, challenge: string) {
  const config = youtubeConfig(), url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: YOUTUBE_SCOPE,
    state, code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent select_account" }).toString();
  return url.toString();
}
type Tokens = { access_token: string; refresh_token?: string; scope?: string };
async function tokenRequest(values: Record<string, string>): Promise<Tokens> {
  const config = youtubeConfig();
  const response = await request("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }) });
  await check(response); const value = await response.json();
  if (typeof value.access_token !== "string") throw new YouTubeError("reconnect", "Google did not return access. Reconnect YouTube.");
  return value;
}
export function exchangeCode(code: string, verifier: string) { return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: youtubeConfig().redirectUri }); }
export async function refreshAccess(refreshToken: string) { return (await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })).access_token; }
export async function revokeToken(token: string) {
  const result = await request("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token }) });
  if (result.status === 400) {
    const body = await result.json().catch(() => ({}));
    if (body.error === "invalid_token") return;
    throw new YouTubeError("unavailable", "Could not confirm Google access revocation. Retry disconnecting.");
  }
  await check(result);
}
export async function channelForToken(token: string) {
  const result = await request("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` } });
  await check(result); const data = await result.json();
  if (data.items?.length !== 1 || !/^UC[\w-]{22}$/.test(data.items[0].id)) throw new YouTubeError("rejected", "Choose a Google / Brand Account with one YouTube channel. Create a channel in YouTube first if needed.");
  return { id: String(data.items[0].id), title: String(data.items[0].snippet?.title || "YouTube channel").slice(0, 200) };
}
export type YouTubeVideo = { id: string; snippet: { channelId: string }; status: { uploadStatus?: string; privacyStatus?: string; publishAt?: string; selfDeclaredMadeForKids?: boolean; containsSyntheticMedia?: boolean; license?: string; embeddable?: boolean; publicStatsViewable?: boolean }; processingDetails?: { processingStatus?: string } };
export async function getVideo(token: string, id: string): Promise<YouTubeVideo> {
  if (!/^[\w-]{11}$/.test(id)) throw new YouTubeError("rejected", "Invalid YouTube video identifier.");
  const result = await request(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${id}`, { headers: { Authorization: `Bearer ${token}` } });
  await check(result); const data = await result.json();
  if (!data.items?.[0]) throw new YouTubeError("missing", "Video not found on the connected channel. Check YouTube Studio.");
  return data.items[0];
}
export async function setVisibility(token: string, video: YouTubeVideo, visibility: "private" | "unlisted" | "public", publishAt: string | null): Promise<YouTubeVideo> {
  const old = video.status;
  const status = { privacyStatus: visibility, ...(publishAt ? { publishAt } : {}), selfDeclaredMadeForKids: old.selfDeclaredMadeForKids, containsSyntheticMedia: old.containsSyntheticMedia,
    license: old.license, embeddable: old.embeddable, publicStatsViewable: old.publicStatsViewable };
  const result = await request("https://www.googleapis.com/youtube/v3/videos?part=status", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: video.id, status }) });
  await check(result); return result.json();
}
export function validateSession(raw: string) {
  const url = new URL(raw);
  if (url.origin !== "https://www.googleapis.com" || url.pathname !== "/upload/youtube/v3/videos" || url.username || url.password || url.hash || url.searchParams.get("uploadType") !== "resumable") throw new YouTubeError("session", "Invalid resumable upload session. Contact support.");
  return url.toString();
}
export async function startUpload(token: string, size: number, metadata: { title: string; description: string; madeForKids: boolean; syntheticMedia: boolean }) {
  const result = await request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size),
  }, body: JSON.stringify({ snippet: { title: metadata.title, description: metadata.description, categoryId: "22" }, status: { privacyStatus: "private", selfDeclaredMadeForKids: metadata.madeForKids, containsSyntheticMedia: metadata.syntheticMedia } }) });
  await check(result);
  const location = result.headers.get("location"); await result.body?.cancel();
  if (!location) throw new YouTubeError("session", "YouTube did not return an upload session.");
  return validateSession(location);
}
export async function uploadPart(token: string, session: string, total: number, offset: number, bytes?: Uint8Array): Promise<{ offset: number; videoId: string | null }> {
  const result = await request(validateSession(session), { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4", "Content-Length": String(bytes?.byteLength || 0),
    "Content-Range": bytes ? `bytes ${offset}-${offset + bytes.byteLength - 1}/${total}` : `bytes */${total}` }, body: bytes ? new Uint8Array(bytes).buffer : undefined }, true);
  if (result.status === 308) {
    const range = result.headers.get("range"), match = range?.match(/^bytes=0-(\d+)$/);
    await result.body?.cancel();
    if (range && !match) throw new YouTubeError("session", "YouTube returned an invalid upload checkpoint.");
    const next = match ? Number(match[1]) + 1 : 0;
    if (next < 0 || next >= total) throw new YouTubeError("session", "YouTube returned an invalid upload offset.");
    return { offset: next, videoId: null };
  }
  if (result.status === 404 || result.status === 410) { await result.body?.cancel(); throw new YouTubeError("session", "The upload session expired. Check YouTube Studio before starting another upload; ETA will not risk uploading a duplicate."); }
  await check(result); const video = await result.json();
  if (!/^[\w-]{11}$/.test(video.id)) throw new YouTubeError("session", "YouTube did not confirm a video ID. Retry this upload to reconcile it.");
  return { offset: total, videoId: video.id };
}
