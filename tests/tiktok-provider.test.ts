import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeTikTokCode, refreshTikTokToken, revokeTikTokToken, tiktokAuthorizationUrl, tiktokCreator, tiktokUser, initTikTokPost, tiktokPostStatus } from "@/lib/social/tiktok";
import { tiktokConfigured, tiktokConfig } from "@/lib/social/tiktok-config";
import { tiktokPublishSchema, validateTikTokCreatorChoice, validateTikTokMedia } from "@/lib/social/tiktok-types";

const creator = { creator_username: "creator", creator_nickname: "Creator", privacy_level_options: ["FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const, comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 60 };
const choices = { caption: "A caption", privacy: "SELF_ONLY" as const, allowComments: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandedContent: false, syntheticMedia: true };
const token = { access_token: "test-access", refresh_token: "test-refresh", open_id: "open-id", expires_in: 86400, refresh_expires_in: 31536000, token_type: "Bearer", scope: "user.info.basic,video.publish" };
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("TIKTOK_CLIENT_KEY", "test-key"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "test-secret"); vi.stubEnv("TIKTOK_REDIRECT_URI", "https://createaivideos.app/api/social/tiktok/callback"); vi.stubEnv("TRIGGER_SECRET_KEY", "test-trigger"); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  fetcher.mockReset(); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const ok = (data: unknown) => Response.json({ data, error: { code: "ok" } });

describe("TikTok provider transport and boundaries", () => {
  it("uses exact HTTPS callbacks and confidential-code OAuth, never putting secrets in authorization URLs", () => {
    const url = new URL(tiktokAuthorizationUrl("random-state"));
    expect(url.origin).toBe("https://www.tiktok.com"); expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish"); expect(url.searchParams.get("state")).toBe("random-state"); expect(url.toString()).not.toContain("test-secret"); expect(tiktokConfigured()).toBe(true);
    for (const uri of ["http://localhost:3000/api/social/tiktok/callback", "https://createaivideos.app/wrong", "https://createaivideos.app/api/social/tiktok/callback?x=1"]) { vi.stubEnv("TIKTOK_REDIRECT_URI", uri); expect(() => tiktokConfig()).toThrow(); }
  });
  it("exchanges and refreshes with POST form bodies and honors rotated refresh tokens and expiries", async () => {
    fetcher.mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(Response.json({ ...token, refresh_token: "rotated" }));
    const result = await exchangeTikTokCode("code"); expect(result).toMatchObject({ openId: "open-id", refreshToken: "test-refresh" }); expect(result.accessExpiresAt).toBeGreaterThan(Date.now());
    expect(fetcher.mock.calls[0][0]).toBe("https://open.tiktokapis.com/v2/oauth/token/"); const init = fetcher.mock.calls[0][1];
    expect(init.method).toBe("POST"); expect(init.body.get("client_secret")).toBe("test-secret"); expect(init.body.get("redirect_uri")).toBe(tiktokConfig().redirectUri); expect(init.redirect).toBe("error"); expect(init.cache).toBe("no-store");
    expect((await refreshTikTokToken("old-refresh")).refreshToken).toBe("rotated"); expect(fetcher.mock.calls[1][1].body.get("grant_type")).toBe("refresh_token");
  });
  it("rejects partially granted scopes and sanitizes OAuth/network/provider errors", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ...token, scope: "user.info.basic" })); await expect(exchangeTikTokCode("code")).rejects.toThrow(/Grant TikTok/);
    fetcher.mockResolvedValueOnce(Response.json({ error: "invalid_grant", error_description: "sensitive-code test-secret" }, { status: 400 })); await expect(exchangeTikTokCode("code")).rejects.toMatchObject({ code: "reconnect" });
    fetcher.mockRejectedValueOnce(new Error("URL contains secret")); await expect(tiktokUser("token")).rejects.toThrow("TikTok could not be reached");
    fetcher.mockResolvedValueOnce(Response.json({ data: creator, error: { code: "spam_risk_too_many_posts", message: "secret" } })); await expect(tiktokCreator("token")).rejects.toThrow(/cannot accept more posts/);
  });
  it("reads profile/creator info only from successful envelopes and supports documented empty revoke response", async () => {
    fetcher.mockResolvedValueOnce(ok({ user: { open_id: "open-id", display_name: "Name" } })).mockResolvedValueOnce(ok(creator)).mockResolvedValueOnce(Response.json({}));
    expect((await tiktokUser("access")).open_id).toBe("open-id"); expect((await tiktokCreator("access")).max_video_post_duration_sec).toBe(60); await revokeTikTokToken("access");
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer access"); expect(fetcher.mock.calls[2][1].body.get("token")).toBe("access");
    fetcher.mockResolvedValueOnce(Response.json({ data: creator })); await expect(tiktokCreator("access")).rejects.toThrow(/unreadable/);
  });
  it("does not treat an expired access token as confirmed remote revocation", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ error: "invalid_token" }, { status: 401 }));
    await expect(revokeTikTokToken("expired")).rejects.toMatchObject({ code: "reconnect" });
  });
  it("uses verified-origin PULL_FROM_URL with exact user choices, AI and commercial fields", async () => {
    fetcher.mockResolvedValueOnce(ok({ publish_id: "publish-id" }));
    const media = `https://createaivideos.app/api/social/tiktok/media/${randomUUID()}?ticket=${"a".repeat(43)}`;
    expect(await initTikTokPost("access", choices, media)).toBe("publish-id");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({ post_info: { title: choices.caption, privacy_level: "SELF_ONLY", disable_comment: true, disable_duet: true, disable_stitch: true, brand_organic_toggle: false, brand_content_toggle: false, is_aigc: true }, source_info: { source: "PULL_FROM_URL", video_url: media } });
    for (const url of [media.replace("createaivideos.app", "attacker.test"), media.replace("/media/", "/other/"), `${media}&other=1`]) await expect(initTikTokPost("access", choices, url)).rejects.toThrow(/Invalid TikTok media/);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("handles processing/private completion and rejects unsafe int64 post links", async () => {
    fetcher.mockResolvedValueOnce(ok({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [9007199254740993, "7412345678901234567", "javascript:alert(1)"] }));
    expect(await tiktokPostStatus("access", "publish-id")).toEqual({ status: "PUBLISH_COMPLETE", publicIds: ["7412345678901234567"] });
    fetcher.mockResolvedValueOnce(ok({ status: "PUBLISH_COMPLETE" })); expect((await tiktokPostStatus("access", "private-id")).publicIds).toEqual([]);
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: "access_token_invalid" } })); await expect(tiktokPostStatus("access", "id")).rejects.toMatchObject({ code: "reconnect" });
  });
});
describe("TikTok consent and format validation", () => {
  const input = () => ({ ...choices, requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, commercialContent: false, rightsConfirmed: true, musicConfirmed: true, brandedPolicyConfirmed: false, scheduledAt: null });
  it("requires explicit privacy, rights, music, AI choice and truthful commercial combination", () => {
    expect(tiktokPublishSchema.safeParse(input()).success).toBe(true);
    for (const patch of [{ privacy: "" }, { rightsConfirmed: false }, { musicConfirmed: false }, { syntheticMedia: undefined }, { commercialContent: true }, { brandOrganic: true }, { brandedContent: true, commercialContent: true, brandedPolicyConfirmed: true }, { scheduledAt: new Date(Date.now() - 1000).toISOString() }]) expect(tiktokPublishSchema.safeParse({ ...input(), ...patch }).success).toBe(false);
    expect(tiktokPublishSchema.safeParse({ ...input(), privacy: "PUBLIC_TO_EVERYONE", brandedContent: true, commercialContent: true, brandedPolicyConfirmed: true }).success).toBe(true);
  });
  it("uses current creator options, private-account audit gates and disabled interactions", () => {
    const info = { ...creator, privacy_level_options: [...creator.privacy_level_options] };
    expect(() => validateTikTokCreatorChoice(choices, info, false)).not.toThrow();
    expect(() => validateTikTokCreatorChoice({ ...choices, allowDuet: true }, info, false)).toThrow(/interaction/);
    expect(() => validateTikTokCreatorChoice({ ...choices, privacy: "PUBLIC_TO_EVERYONE" }, info, true)).toThrow(/privacy/);
    expect(() => validateTikTokCreatorChoice(choices, { ...info, privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, false)).toThrow(/private TikTok account/);
  });
  it("checks actual video codec, duration, ratio, frame rate, rotation and audio", () => {
    const media = { format: { duration: "15" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", codec_name: "aac" }] };
    expect(validateTikTokMedia(media).duration).toBe(15);
    for (const patch of [{ width: 1920, height: 1080 }, { codec_name: "vp9" }, { avg_frame_rate: "1/0" }, { side_data_list: [{ rotation: 90 }] }]) expect(() => validateTikTokMedia({ ...media, streams: [{ ...media.streams[0], ...patch }] })).toThrow();
    expect(() => validateTikTokMedia({ ...media, format: { duration: "61" } })).toThrow();
    expect(() => validateTikTokMedia({ ...media, streams: [media.streams[0], { codec_type: "audio", codec_name: "mp3" }] })).toThrow();
  });
});
