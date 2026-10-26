import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { facebookConfig, FACEBOOK_SCOPES } from "@/lib/social/facebook-config";
import { createFacebookReel, facebookAuthorizationUrl, facebookReelStatus, FacebookGrantError, finishFacebookReel, loadFacebookGrant, parseFacebookSignedRequest, uploadFacebookReel, verifyFacebookPage } from "@/lib/social/facebook";
import { FACEBOOK_CONTENT_TASKS } from "@/lib/social/facebook-oauth-diagnostics";
import { facebookPublishSchema, validateFacebookMedia } from "@/lib/social/facebook-types";

const fetcher = vi.fn(), origin = "https://storage.example.com";
beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_ID", "123"); vi.stubEnv("FACEBOOK_APP_SECRET", "test-secret"); vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v25.0");
  vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://createaivideos.app/api/social/facebook/callback"); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
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
    const grant = await loadFacebookGrant("user-token");
    expect(grant.pages.map((page) => page.id)).toEqual(["222"]);
    expect(grant.diagnostics).toMatchObject({ returnedPages: 2, eligiblePages: 1, taskCounts: { CREATE_CONTENT: 1, ANALYZE: 1 } });
    for (const [url, opts] of fetcher.mock.calls) { expect(new URL(url).origin).toBe("https://graph.facebook.com"); expect(opts.redirect).toBe("error"); expect(url).not.toContain("user-token"); }
    expect(new URL(fetcher.mock.calls[3][0]).searchParams.get("after")).toBe("cursor");
  });
  it("rejects missing permissions and verifies the selected Page's identity", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" })).mockResolvedValueOnce(json({ data: [] }));
    await expect(loadFacebookGrant("token")).rejects.toMatchObject({ outcome: "permissions_missing", diagnostics: { returnedPages: 0 } });
    fetcher.mockResolvedValueOnce(json({ id: "333", name: "Different" })); await expect(verifyFacebookPage("token", "222")).rejects.toThrow(/original/);
  });
  it("distinguishes an empty API Page list from Pages without recognized publishing tasks", async () => {
    const prepare = () => fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }));
    prepare().mockResolvedValueOnce(json({ data: [] }));
    await expect(loadFacebookGrant("private-token")).rejects.toMatchObject({
      outcome: "pages_not_returned", diagnostics: { returnedPages: 0, eligiblePages: 0, taskCounts: {} },
    });
    prepare().mockResolvedValueOnce(json({ data: [
      { id: "222", name: "Private Page", access_token: "private-page-token", tasks: ["ANALYZE", "ANALYZE", "PROFILE_PLUS_FACEBOOK_ACCESS", "unknown-secret-task"] },
      { id: "333", name: "Other Private Page", access_token: "another-token", tasks: [] },
    ] }));
    const error = await loadFacebookGrant("private-token").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(FacebookGrantError);
    expect(error).toMatchObject({ outcome: "page_content_access_missing", diagnostics: {
      returnedPages: 2, eligiblePages: 0, pagesWithoutTasks: 1, unrecognizedTasks: 1,
      taskCounts: { ANALYZE: 1, PROFILE_PLUS_FACEBOOK_ACCESS: 1 },
    } });
    expect(JSON.stringify((error as FacebookGrantError).diagnostics)).not.toMatch(/Private Page|private-token|private-page-token|unknown-secret-task/);
  });
  it.each([...FACEBOOK_CONTENT_TASKS])("keeps existing publishing eligibility for %s", async (task) => {
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [{ id: "222", name: "Page", access_token: "page-token", tasks: [task] }] }));
    expect((await loadFacebookGrant("token")).pages.map((page) => page.id)).toEqual(["222"]);
  });
  it("keeps counts across filtered pages of results and does not authorize unknown task variants", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [{ id: "222", name: "Page", access_token: "page-token", tasks: ["PROFILE_PLUS_MANAGE"] }],
        paging: { next: "https://graph.facebook.com/next", cursors: { after: "next-cursor" } } }))
      .mockResolvedValueOnce(json({ data: [{ id: "333", name: "Other", access_token: "other-token", tasks: ["NEW_UNKNOWN_ROLE"] }] }));
    await expect(loadFacebookGrant("token")).rejects.toMatchObject({ outcome: "page_content_access_missing", diagnostics: {
      returnedPages: 2, eligiblePages: 0, unrecognizedTasks: 1, taskCounts: { PROFILE_PLUS_MANAGE: 1 },
    } });
  });
  it("does not misclassify a rejected or malformed Page API response as an empty list", async () => {
    const prepare = () => fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }));
    prepare().mockResolvedValueOnce(json({ error: { code: 10, message: "private-provider-error" } }, 403));
    await expect(loadFacebookGrant("token")).rejects.toMatchObject({ code: "rejected" });
    prepare().mockResolvedValueOnce(json({ data: [{ id: "222", name: "Page" }] }));
    const malformed = await loadFacebookGrant("token").catch((failure: unknown) => failure);
    expect(malformed).not.toBeInstanceOf(FacebookGrantError);
  });
  it("inspects only intersected Page-specific grants and does not authorize a returned token without valid PAGE metadata", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: {
        app_id: "123", user_id: "111", is_valid: true, expires_at: 0, scopes: [...FACEBOOK_SCOPES],
        granular_scopes: [
          { scope: "pages_show_list", target_ids: ["222", "333"] },
          { scope: "pages_read_engagement", target_ids: ["222", "333"] },
          { scope: "pages_manage_posts", target_ids: ["222"] },
        ],
      } })).mockResolvedValueOnce(json({ id: "222", name: "private-page-name", access_token: "must-not-be-used" }))
      .mockResolvedValueOnce(json({ id: "222", access_token: "diagnostic-only-page-token" }));
    const failure = await loadFacebookGrant("private-user-token").catch((error: unknown) => error) as FacebookGrantError;
    expect(failure.outcome).toBe("page_token_access_unverified");
    expect(failure.diagnostics.pageGrants).toMatchObject({ status: "verified", commonTargets: 1, inspectedTargets: 1, readableTargets: 1,
      pageTokenProbe: { attemptedTargets: 1, tokensReturned: 1, missingTokens: 0, rejectedTargets: 0, unavailableTargets: 0, invalidResponses: 0 } });
    expect(JSON.stringify(failure)).not.toMatch(/private-user-token|private-page-name|must-not-be-used|diagnostic-only-page-token|222|333/);
    const [debugUrl, debugRequest] = fetcher.mock.calls[3];
    expect(new URL(debugUrl).pathname).toBe("/v25.0/debug_token");
    expect(new URL(debugUrl).searchParams.get("input_token")).toBe("private-user-token");
    expect(debugRequest.headers.Authorization).toBe("Bearer 123|test-secret");
    expect(debugUrl).not.toContain("test-secret");
    const [pageUrl, pageRequest] = fetcher.mock.calls[4];
    expect(new URL(pageUrl).pathname).toBe("/v25.0/222");
    expect(new URL(pageUrl).searchParams.get("fields")).toBe("id");
    expect(pageRequest.headers.Authorization).toBe("Bearer private-user-token");
    const [tokenUrl] = fetcher.mock.calls[5];
    expect(new URL(tokenUrl).pathname).toBe("/v25.0/222");
    expect(new URL(tokenUrl).searchParams.get("fields")).toBe("id,access_token");
    for (const [, options] of fetcher.mock.calls) {
      expect(options.method).toBe("GET"); expect(options.cache).toBe("no-store"); expect(options.redirect).toBe("error");
    }
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
  it("limits empty-list Page probes to five and reports read rejections and identity mismatches honestly", async () => {
    const targets = Array.from({ length: 6 }, (_, i) => String(i + 222));
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: { app_id: "123", user_id: "111", is_valid: true, expires_at: 0, scopes: [...FACEBOOK_SCOPES],
        granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: targets })) } }))
      .mockResolvedValueOnce(json({ id: "222" }))
      .mockResolvedValueOnce(json({ error: { code: 10, message: "private-provider-error" } }, 403))
      .mockResolvedValueOnce(json({ id: "999" }))
      .mockResolvedValueOnce(json({ error: { is_transient: true } }, 503))
      .mockResolvedValueOnce(json({ id: "226" }))
      .mockResolvedValueOnce(json({ id: "222", access_token: "diagnostic-page-token" }))
      .mockResolvedValueOnce(json({ id: "226" }));
    await expect(loadFacebookGrant("token")).rejects.toMatchObject({ outcome: "page_token_access_unverified", diagnostics: { pageGrants: {
      status: "verified", commonTargets: 6, inspectedTargets: 5, readableTargets: 2, rejectedTargets: 1, unavailableTargets: 2, truncated: true,
      pageTokenProbe: { attemptedTargets: 2, tokensReturned: 1, missingTokens: 1 },
    } } });
    expect(fetcher).toHaveBeenCalledTimes(12);
  });
  it("never probes targets from an invalid token or makes empty-list inspection mandatory for working connections", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: { app_id: "999", user_id: "111", is_valid: true, expires_at: 0, scopes: [...FACEBOOK_SCOPES],
        granular_scopes: FACEBOOK_SCOPES.map((scope) => ({ scope, target_ids: ["222"] })) } }));
    await expect(loadFacebookGrant("token")).rejects.toMatchObject({ diagnostics: { pageGrants: { status: "invalid", inspectedTargets: 0 } } });
    expect(fetcher).toHaveBeenCalledTimes(4);
    fetcher.mockReset();
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [{ id: "222", name: "Allowed", access_token: "page-token", tasks: ["CREATE_CONTENT"] }] }));
    expect((await loadFacebookGrant("token")).diagnostics.pageGrants).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retains the empty-list result when optional token inspection is unavailable", async () => {
    fetcher.mockResolvedValueOnce(json({ id: "111" }))
      .mockResolvedValueOnce(json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }))
      .mockResolvedValueOnce(json({ data: [] }))
      .mockRejectedValueOnce(new Error("private-request-url-and-token"));
    const failure = await loadFacebookGrant("token").catch((error: unknown) => error) as FacebookGrantError;
    expect(failure).toMatchObject({ outcome: "pages_not_returned", diagnostics: { pageGrants: { status: "unavailable", inspectedTargets: 0 } } });
    expect(JSON.stringify(failure)).not.toContain("private-request");
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
