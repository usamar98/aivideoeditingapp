import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hash } from "./crypto";
import { resolveVideo } from "./library";
import type { TikTokPost } from "./tiktok-types";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export const TIKTOK_MEDIA_MAX = 200 * 1024 * 1024;
// Opaque, scoped capability: no public storage bucket and no redirects to TikTok.
export async function serveTikTokMedia(db: SupabaseClient, id: string, request: Request) {
  const fail = (status = 404) => new Response(null, { status, headers });
  const ticket = new URL(request.url).searchParams.get("ticket") || "";
  if (!z.uuid().safeParse(id).success || !/^[\w-]{43}$/.test(ticket)) return fail();
  const result = await db.from("tiktok_posts").select("*,tiktok_connections!inner(status)").eq("id", id).eq("tiktok_connections.status", "connected").maybeSingle();
  const post = result.data as (TikTokPost & { tiktok_connections: { status: string } }) | null;
  if (result.error || !post?.init_started_at || !post.media_ticket_hash || post.media_ticket_hash.length !== 43 || !post.media_expires_at || Date.parse(post.media_expires_at) <= Date.now()
    || !["publishing", "processing", "needs_attention"].includes(post.status) || !timingSafeEqual(Buffer.from(hash(ticket)), Buffer.from(post.media_ticket_hash))) return fail();
  const source = await resolveVideo(db, post.user_id, { kind: post.source_kind, projectId: post.source_project_id, outputKey: post.source_output_key });
  if (source.path !== post.source_path) return fail();
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(range)) return fail(416);
  const signed = await db.storage.from("private-media").createSignedUrl(source.path, 300);
  if (signed.error || !signed.data?.signedUrl) return fail(503);
  const url = new URL(signed.data.signedUrl), storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (url.origin !== storage.origin || url.protocol !== "https:" || !url.pathname.startsWith("/storage/v1/object/sign/private-media/")) return fail(503);
  const remote = await fetch(url, { method: request.method === "HEAD" ? "HEAD" : "GET", headers: range ? { Range: range } : {}, redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]) });
  const length = Number(remote.headers.get("content-length")), contentRange = remote.headers.get("content-range"), total = contentRange ? Number(/\/(\d+)$/.exec(contentRange)?.[1]) : length;
  if (![200, 206].includes(remote.status) || !Number.isFinite(total) || total <= 0 || total > TIKTOK_MEDIA_MAX || !Number.isFinite(length) || length <= 0 || length > TIKTOK_MEDIA_MAX) {
    await remote.body?.cancel(); return fail(remote.status === 416 ? 416 : 503);
  }
  const forwarded = new Headers({ ...headers, "Content-Type": "video/mp4", "Content-Length": String(length), "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" });
  if (contentRange) forwarded.set("Content-Range", contentRange);
  // Stream, never buffer a potentially 200 MiB export in a Vercel response.
  return new Response(remote.body, { status: remote.status, headers: forwarded });
}
