import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "@/lib/social/crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/social/library", () => ({ resolveVideo: vi.fn() }));
import { resolveVideo } from "@/lib/social/library";
import { serveTikTokMedia, TIKTOK_MEDIA_MAX } from "@/lib/social/tiktok-media";

const id = randomUUID(), ticket = "a".repeat(43), owner = randomUUID();
let post: Record<string, unknown>, query: Record<string, ReturnType<typeof vi.fn>>, signed: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>;
function db() { return { from: () => query, storage: { from: () => ({ createSignedUrl: signed }) } } as unknown as SupabaseClient; }
const request = (value = ticket, init?: RequestInit) => new Request(`https://createaivideos.app/api/social/tiktok/media/${id}?ticket=${value}`, init);
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  post = { id, user_id: owner, source_kind: "shorts", source_project_id: randomUUID(), source_output_key: "clip-1", source_path: "owned/video.mp4", status: "processing", init_started_at: new Date().toISOString(), media_ticket_hash: hash(ticket), media_expires_at: new Date(Date.now() + 7200_000).toISOString() };
  query = Object.fromEntries(["select", "eq"].map((key) => [key, vi.fn(() => query)])); query.maybeSingle = vi.fn(async () => ({ data: post, error: null }));
  signed = vi.fn(async () => ({ data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/private-media/owned/video.mp4?token=private" }, error: null }));
  vi.mocked(resolveVideo).mockResolvedValue({ path: "owned/video.mp4", title: "Owned" });
  fetcher = vi.fn(async () => new Response("abc", { headers: { "content-length": "3" } })); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("TikTok media capability streaming", () => {
  it("streams the exact owned export without a redirect, secret response or public cache", async () => {
    const response = await serveTikTokMedia(db(), id, request()); expect(response.status).toBe(200); expect(await response.text()).toBe("abc");
    expect(resolveVideo).toHaveBeenCalledWith(expect.anything(), owner, { kind: "shorts", projectId: post.source_project_id, outputKey: "clip-1" });
    expect(query.eq).toHaveBeenCalledWith("tiktok_connections.status", "connected"); expect(signed).toHaveBeenCalledWith("owned/video.mp4", 300);
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("location")).toBeNull(); expect(response.headers.get("content-type")).toBe("video/mp4"); expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("denies malformed, wrong, expired tickets, unstarted/cancelled/deleted posts before accessing storage", async () => {
    expect((await serveTikTokMedia(db(), "bad-id", request())).status).toBe(404); expect((await serveTikTokMedia(db(), id, request("wrong"))).status).toBe(404); expect((await serveTikTokMedia(db(), id, request("b".repeat(43)))).status).toBe(404);
    post.media_expires_at = new Date(Date.now() - 1000).toISOString(); expect((await serveTikTokMedia(db(), id, request())).status).toBe(404);
    post.media_expires_at = new Date(Date.now() + 10000).toISOString(); post.status = "cancelled"; expect((await serveTikTokMedia(db(), id, request())).status).toBe(404);
    post.status = "processing"; post.init_started_at = null; expect((await serveTikTokMedia(db(), id, request())).status).toBe(404);
    query.maybeSingle.mockResolvedValueOnce({ data: null }); expect((await serveTikTokMedia(db(), id, request())).status).toBe(404); expect(signed).not.toHaveBeenCalled();
  });
  it("rejects replaced exports and remote URLs outside the configured storage origin/prefix", async () => {
    vi.mocked(resolveVideo).mockResolvedValueOnce({ path: "different/video.mp4", title: "Changed" }); expect((await serveTikTokMedia(db(), id, request())).status).toBe(404);
    for (const signedUrl of ["https://evil.test/video.mp4", "https://project.supabase.co/wrong/video.mp4", "http://project.supabase.co/storage/v1/object/sign/private-media/file.mp4"]) { signed.mockResolvedValueOnce({ data: { signedUrl } }); expect((await serveTikTokMedia(db(), id, request())).status).toBe(503); }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("supports bounded single byte ranges/HEAD and rejects invalid ranges or oversized responses", async () => {
    fetcher.mockResolvedValueOnce(new Response("abc", { status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/100" } }));
    const response = await serveTikTokMedia(db(), id, request(ticket, { headers: { Range: "bytes=0-2" } })); expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 0-2/100"); expect(fetcher.mock.calls[0][1].headers).toEqual({ Range: "bytes=0-2" });
    expect((await serveTikTokMedia(db(), id, request(ticket, { headers: { Range: "bytes=0-2,4-6" } }))).status).toBe(416);
    fetcher.mockResolvedValueOnce(new Response(null, { headers: { "content-length": "100" } })); expect((await serveTikTokMedia(db(), id, request(ticket, { method: "HEAD" }))).status).toBe(200); expect(fetcher.mock.calls[1][1].method).toBe("HEAD");
    fetcher.mockResolvedValueOnce(new Response("abc", { headers: { "content-length": String(TIKTOK_MEDIA_MAX + 1) } })); expect((await serveTikTokMedia(db(), id, request())).status).toBe(503);
  });
});
