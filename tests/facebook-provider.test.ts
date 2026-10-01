import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { facebookConfig, FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { createFacebookReel, facebookAuthorizationUrl, facebookReelStatus, finishFacebookReel, loadFacebookGrant, parseFacebookSignedRequest, uploadFacebookReel, verifyFacebookPage } from "@/lib/social/facebook";
import { facebookPublishSchema, validateFacebookMedia } from "@/lib/social/facebook-types";

const fetcher = vi.fn(), origin = "https://storage.example.com";
beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "test-secret"); vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v25.0");
  vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://www.editingapp.live/api/social/facebook/callback"); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", origin); vi.stubGlobal("fetch", fetcher); fetcher.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const json = (data: unknown, status = 200) => Response.json(data, { status });
const signed = (patch = {}) => {
  const payload = Buffer.from(JSON.stringify({ user_id: "12345", algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), ...patch })).toString("base64url");
  return `${createHmac("sha256", "test-secret").update(payload).digest("base64url")}.${payload}`;
};
describe("Facebook provider and request validation", () => {
  it("uses the exact server callback, narrow scopes, state and a valid configured version", () => {
    const url = new URL(facebookAuthorizationUrl("random-state"));
    expect(url.origin).toBe("https://www.facebook.com"); expect(url.searchParams.get("state")).toBe("random-state");
    expect(url.searchParams.get("scope")).toBe(FACEBOOK_SCOPES.join(",")); expect(url.searchParams.has("client_secret")).toBe(false);
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://evil.example/callback"); expect(facebookConfig).toThrow();
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "http://localhost:3004/api/social/facebook/callback"); expect(facebookConfig().origin).toContain("localhost");
    vi.stubEnv("FACEBOOK_GRAPH_VERSION", "../me"); expect(facebookConfig).toThrow();
  });
  it("verifies signed deletion, rejects tampering, invalid users, algorithms and future issue dates", () => {
    expect(parseFacebookSignedRequest(signed()).user_id).toBe("12345");
    expect(() => parseFacebookSignedRequest(signed() + "x")).toThrow();
    expect(() => parseFacebookSignedRequest(signed({ algorithm: "none" }))).toThrow();
    expect(() => parseFacebookSignedRequest(signed({ user_id: "../me" }))).toThrow();
    expect(() => parseFacebookSignedRequest(signed({ issued_at: Date.now() / 1000 + 3600 }))).toThrow();
    expect(() => parseFacebookSignedRequest("x".repeat(12001))).toThrow();
  });
  it("checks scopes and filters Pages by content access; never follows a provider next URL", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" })).mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [{ id: "222", name: "Allowed", access_token: "secret-page", tasks: ["CREATE_CONTENT"] }, { id: "333", name: "Read only", access_token: "not-allowed", tasks: ["ANALYZE"] }], paging: { next: "https://attacker.test/steal", cursors: { after: "cursor" } } }))
      .mockResolvedValueOnce(json({ data: [] }));
    expect((await loadFacebookGrant("user-token")).pages.map((page) => page.id)).toEqual(["222"]);
    for (const [url, opts] of fetcher.mock.calls) { expect(new URL(url).origin).toBe("https://graph.facebook.com"); expect(opts.redirect).toBe("error"); expect(url).not.toContain("user-token"); }
    expect(new URL(fetcher.mock.calls[3][0]).searchParams.get("after")).toBe("cursor");
  });
  it("rejects missing permissions and verifies the selected Page's identity", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" })).mockResolvedValueOnce(json({ data: [] }));
    await expect(loadFacebookGrant("token")).rejects.toThrow(/Allow Page/);
    fetcher.mockResolvedValueOnce(json({ id: "333", name: "Different" })); await expect(verifyFacebookPage("token", "222")).rejects.toThrow(/original/);
  });
  it("restricts upload URLs and sends only a same-storage short-lived media URL", async () => {
    fetcher.mockResolvedValueOnce(json({ video_id: "444", upload_url: "https://attacker.test/444" }));
    await expect(createFacebookReel("token", "222")).rejects.toThrow(/destination/);
    fetcher.mockReset();
    await expect(uploadFacebookReel("token", "444", "https://attacker.test/video.mp4")).rejects.toThrow(/private media URL/);
    expect(fetcher).not.toHaveBeenCalled();
    const signedUrl = `${origin}/storage/v1/object/sign/private-media/owned/video.mp4?token=test`;
    fetcher.mockResolvedValueOnce(json({ success: true })); await uploadFacebookReel("token", "444", signedUrl);
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ Authorization: "OAuth token", file_url: signedUrl });
  });
  it("publishes only the intended Page/video with proof and redacts provider errors", async () => {
    fetcher.mockResolvedValueOnce(json({ success: true })); await finishFacebookReel("token", "222", "444", "Title", "Caption");
    const [url, options] = fetcher.mock.calls[0]; expect(url).toBe("https://graph.facebook.com/v25.0/222/video_reels");
    expect(options.body.get("video_state")).toBe("PUBLISHED"); expect(options.body.get("video_id")).toBe("444"); expect(options.body.has("appsecret_proof")).toBe(true);
    fetcher.mockResolvedValueOnce(json({ error: { code: 190, message: "sensitive-token-detail" } }, 401));
    await expect(facebookReelStatus("token", "444")).rejects.toMatchObject({ code: "reconnect", message: expect.not.stringContaining("sensitive-token-detail") });
  });
  it("requires rights, AI choice, supported source and safe future scheduling", () => {
    const input = { requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, title: "Reel", description: "", scheduledAt: null, syntheticMedia: true, rightsConfirmed: true };
    expect(facebookPublishSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ rightsConfirmed: false }, { syntheticMedia: undefined }, { title: " " }, { scheduledAt: new Date(Date.now() - 1000).toISOString() }, { description: "x".repeat(2001) }]) expect(facebookPublishSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("accepts the conservative Reel profile and rejects landscape/long/bad-codec exports", () => {
    const video = { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30000/1001" };
    const media = { format: { duration: "30" }, streams: [video, { codec_type: "audio", codec_name: "aac" }] };
    expect(() => validateFacebookMedia(media)).not.toThrow();
    expect(() => validateFacebookMedia({ ...media, format: { duration: 61 } })).toThrow();
    for (const patch of [{ width: 1920, height: 1080 }, { codec_name: "hevc" }, { avg_frame_rate: "0/0" }, { side_data_list: [{ rotation: 90 }] }]) expect(() => validateFacebookMedia({ ...media, streams: [{ ...video, ...patch }] })).toThrow();
  });
});
