import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { seal, unseal, hash, oauthSecrets } from "@/lib/social/crypto";
import { youtubeConfig, youtubeConfigured, YOUTUBE_SCOPE } from "@/lib/social/config";
import { publishSchema, type SocialPost } from "@/lib/social/types";
import { ownedOutputPath } from "@/lib/social/library";
import { postView } from "@/lib/social/repository";
import { authorizationUrl, exchangeCode, getVideo, refreshAccess, revokeToken, setVisibility, startUpload, uploadPart, validateSession } from "@/lib/social/youtube";

const session = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test";
const video = { id: "abcdefghijk", snippet: { channelId: "UC" + "x".repeat(22) }, status: { uploadStatus: "processed", privacyStatus: "private", publishAt: "2030-01-01T00:00:00Z", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, license: "youtube", embeddable: true } };
beforeEach(() => {
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("YOUTUBE_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("YOUTUBE_REDIRECT_URI", "http://localhost:3004/api/social/youtube/callback");
  vi.stubEnv("TRIGGER_SECRET_KEY", "test-trigger");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("YouTube security and request validation", () => {
  it("encrypts with fresh IVs and binds credentials to their owner and channel", () => {
    const encrypted = seal("refresh-secret", "user:channel");
    expect(encrypted).not.toContain("refresh-secret");
    expect(seal("refresh-secret", "user:channel")).not.toBe(encrypted);
    expect(unseal(encrypted, "user:channel")).toBe("refresh-secret");
    expect(() => unseal(encrypted, "other-user:channel")).toThrow();
    const parts = encrypted.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => unseal(parts.join("."), "user:channel")).toThrow();
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "short"); expect(() => seal("secret", "context")).toThrow();
  });
  it("uses independent state and S256 PKCE with offline video-management consent", () => {
    const secrets = oauthSecrets(), other = oauthSecrets();
    expect(secrets.verifier.length).toBeGreaterThanOrEqual(43);
    expect(secrets.state).not.toBe(other.state); expect(secrets.challenge).toBe(hash(secrets.verifier));
    const url = new URL(authorizationUrl(secrets.state, secrets.challenge));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(secrets.state);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it("requires a fixed HTTPS callback (HTTP only on localhost) and full configuration", () => {
    expect(youtubeConfigured()).toBe(true);
    for (const bad of ["http://editingapp.live/api/social/youtube/callback", "https://editingapp.live/wrong", "https://u:p@editingapp.live/api/social/youtube/callback", "https://editingapp.live/api/social/youtube/callback?next=evil"]) {
      vi.stubEnv("YOUTUBE_REDIRECT_URI", bad); expect(() => youtubeConfig()).toThrow(); expect(youtubeConfigured()).toBe(false);
    }
  });
  it("validates explicit consent, schedules, title and UTF-8 description limits", () => {
    const input = { requestId: randomUUID(), source: { kind: "cartoon", projectId: randomUUID(), outputKey: "" }, title: "Test", description: "a".repeat(5000), visibility: "private", scheduledAt: null, madeForKids: false, syntheticMedia: true, rightsConfirmed: true };
    expect(publishSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ rightsConfirmed: false }, { title: "<bad>" }, { title: " " }, { description: "😀".repeat(1300) }, { source: { ...input.source, outputKey: "../other" } }, { scheduledAt: new Date(Date.now() - 1000).toISOString() }, { scheduledAt: new Date(Date.now() + 3600_000).toISOString() }]) expect(publishSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(publishSchema.safeParse({ ...input, visibility: "public", scheduledAt: new Date(Date.now() + 3600_000).toISOString() }).success).toBe(true);
    expect(publishSchema.parse({ ...input, title: " Keep spaces " }).title).toBe(" Keep spaces ");
  });
  it("accepts only owned private MP4 paths and excludes server credentials from DTOs", () => {
    expect(ownedOutputPath("workspace/user/cartoon/file.mp4", "workspace", "user")).toBe(true);
    for (const p of ["workspace/other/file.mp4", "workspace/user/../other.mp4", "workspace/user/%2e/file.mp4", "https://evil/file.mp4", "workspace/user/file.svg", "workspace/user//file.mp4"]) expect(ownedOutputPath(p, "workspace", "user")).toBe(false);
    const safe = postView({ id: randomUUID(), youtube_video_id: video.id, upload_session: "encrypted-secret", source_path: "private-path", user_id: "private-owner" } as SocialPost);
    expect(JSON.stringify(safe)).not.toMatch(/encrypted-secret|private-path|private-owner/);
    expect(safe.youtubeUrl).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
});

describe("YouTube HTTP protocol", () => {
  it("exchanges with PKCE and never leaks raw provider errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access", refresh_token: "test-refresh" })).mockResolvedValueOnce(Response.json({ error: "invalid_grant", error_description: "secret-value" }, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    await exchangeCode("one-use-code", "pkce-verifier");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("code_verifier=pkce-verifier"); expect(init.redirect).toBe("error");
    await expect(refreshAccess("refresh-secret")).rejects.toMatchObject({ code: "reconnect", message: expect.not.stringContaining("secret-value") });
  });
  it("starts every upload privately with user disclosure choices", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { location: session } })); vi.stubGlobal("fetch", fetcher);
    expect(await startUpload("access", 100, { title: "Title", description: "Exact description", madeForKids: false, syntheticMedia: true })).toBe(session);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.status).toEqual({ privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true });
    expect(body.snippet.description).toBe("Exact description");
  });
  it("probes/resumes an upload without sending duplicate bytes and resolves a lost final response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-3" } })).mockResolvedValueOnce(Response.json({ id: video.id })); vi.stubGlobal("fetch", fetcher);
    expect(await uploadPart("access", session, 8, 0)).toEqual({ offset: 4, videoId: null });
    expect(fetcher.mock.calls[0][1].headers["Content-Range"]).toBe("bytes */8");
    expect(await uploadPart("access", session, 8, 4, new Uint8Array([1, 2, 3, 4]))).toEqual({ offset: 8, videoId: video.id });
    expect(fetcher.mock.calls[1][1].headers["Content-Range"]).toBe("bytes 4-7/8");
  });
  it("rejects unsafe sessions, malformed offsets and expired sessions", async () => {
    for (const url of ["http://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable", "https://evil.test/upload/youtube/v3/videos?uploadType=resumable", "https://www.googleapis.com/other?uploadType=resumable"]) expect(() => validateSession(url)).toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-9" } })).mockResolvedValueOnce(new Response(null, { status: 410 })));
    await expect(uploadPart("access", session, 8, 0)).rejects.toMatchObject({ code: "session" });
    await expect(uploadPart("access", session, 8, 0)).rejects.toMatchObject({ code: "session", message: expect.stringContaining("duplicate") });
  });
  it("clears a schedule without clearing audience, disclosure or license", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(video)); vi.stubGlobal("fetch", fetcher);
    await setVisibility("access", video, "private", null);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.status).toEqual({ privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, license: "youtube", embeddable: true });
    expect(body.status).not.toHaveProperty("publishAt");
  });
  it("handles quota, transient errors, deleted videos and already-revoked tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 })).mockRejectedValueOnce(new Error("secret-url")).mockResolvedValueOnce(Response.json({ items: [] })).mockResolvedValueOnce(Response.json({ error: "invalid_token" }, { status: 400 })));
    await expect(getVideo("a", video.id)).rejects.toMatchObject({ code: "quota" });
    await expect(getVideo("a", video.id)).rejects.toMatchObject({ code: "unavailable", message: expect.not.stringContaining("secret-url") });
    await expect(getVideo("a", video.id)).rejects.toMatchObject({ code: "missing" });
    await expect(revokeToken("already-revoked")).resolves.toBeUndefined();
  });
});
