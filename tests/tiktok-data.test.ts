import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), connection: vi.fn(), withToken: vi.fn(), creator: vi.fn(), videos: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account }));
vi.mock("@/lib/social/library", () => ({ listVideos: mocks.videos, resolveVideo: mocks.resolve }));
vi.mock("@/lib/social/tiktok-repository", async (original) => ({ ...await original<object>(), tiktokConnection: mocks.connection, withTikTokToken: mocks.withToken }));
vi.mock("@/lib/social/tiktok", async (original) => ({ ...await original<object>(), tiktokCreator: mocks.creator }));
import { getTikTokDashboard } from "@/lib/social/tiktok-dashboard";
import { GET as preview } from "@/app/api/social/tiktok/preview/route";
import { TikTokError } from "@/lib/social/tiktok";

const owner = randomUUID(), project = randomUUID();
let query: Record<string, ReturnType<typeof vi.fn>>, signed: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TIKTOK_CLIENT_KEY", "key"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "secret"); vi.stubEnv("TIKTOK_REDIRECT_URI", "https://createaivideos.app/api/social/tiktok/callback"); vi.stubEnv("TRIGGER_SECRET_KEY", "trigger"); vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "12".repeat(32));
  query = Object.fromEntries(["select", "eq", "order"].map((key) => [key, vi.fn(() => query)]));
  query.limit = vi.fn(async () => ({ error: null, data: [{ id: randomUUID(), user_id: owner, caption: "Caption", privacy: "SELF_ONLY", status: "processing", init_started_at: "2026-10-27T00:00:00Z", scheduled_at: null, created_at: "2026-10-27T00:00:00Z", error_message: null, publish_id: "private-id", media_ticket_hash: "secret-hash", source_path: "private/path.mp4" }] }));
  signed = vi.fn(async () => ({ error: null, data: { signedUrl: "https://project.supabase.co/signed-private-export" } }));
  mocks.account.mockResolvedValue({ user: { id: owner }, admin: { from: () => query, storage: { from: () => ({ createSignedUrl: signed }) } } });
  mocks.connection.mockResolvedValue({ id: randomUUID(), user_id: owner, open_id: "private-open-id", display_name: "Creator", username: "creator", status: "connected", tokens: "encrypted-secret", token_lease: "secret-lease" });
  mocks.videos.mockResolvedValue([]); mocks.withToken.mockImplementation(async (_db, _user, run) => run("access"));
  mocks.creator.mockResolvedValue({ creator_username: "creator", creator_nickname: "Nickname", privacy_level_options: ["SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 60 });
  mocks.resolve.mockResolvedValue({ path: "owned/export.mp4", title: "Export" });
});
afterEach(() => vi.unstubAllEnvs());
describe("TikTok dashboard and owned preview data", () => {
  it("works before optional configuration/migration without querying TikTok tables", async () => {
    vi.stubEnv("TIKTOK_CLIENT_KEY", ""); const data = await getTikTokDashboard(); expect(data.configured).toBe(false); expect(mocks.connection).not.toHaveBeenCalled(); expect(query.select).not.toHaveBeenCalled();
  });
  it("authenticates and returns only safe owner-filtered view fields with fresh creator info", async () => {
    const data = await getTikTokDashboard(); expect(data.creator?.creator_nickname).toBe("Nickname"); expect(query.eq).toHaveBeenCalledWith("user_id", owner); expect(mocks.withToken).toHaveBeenCalledWith(expect.anything(), owner, expect.any(Function));
    expect(data.connection).toEqual({ display_name: "Creator", username: "creator", status: "connected" });
    expect(JSON.stringify(data)).not.toMatch(/encrypted-secret|private-open-id|secret-lease|secret-hash|private\/path|private-id/);
  });
  it("fails closed for creator errors and never offers stale posting settings", async () => {
    mocks.creator.mockRejectedValueOnce(new TikTokError("rejected", "Creator cannot post now.")); const data = await getTikTokDashboard(); expect(data.creator).toBeNull(); expect(data.error).toBe("Creator cannot post now.");
    mocks.account.mockRejectedValueOnce(new Error("not signed in")); await expect(getTikTokDashboard()).rejects.toThrow();
  });
  it("resolves preview ownership from the session and ignores client-supplied paths", async () => {
    const response = await preview(new Request(`https://createaivideos.app/api/social/tiktok/preview?kind=shorts&projectId=${project}&outputKey=clip-1&user_id=attacker&sourcePath=foreign.mp4`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), owner, { kind: "shorts", projectId: project, outputKey: "clip-1" }); expect(signed).toHaveBeenCalledWith("owned/export.mp4", 600);
  });
  it("does not issue preview links for invalid, unauthenticated or unavailable exports", async () => {
    const url = `https://createaivideos.app/api/social/tiktok/preview?kind=shorts&projectId=${project}&outputKey=clip-1`;
    expect((await preview(new Request(url.replace(project, "invalid")))).status).toBe(400);
    mocks.account.mockRejectedValueOnce(new Error("no session")); expect((await preview(new Request(url))).status).toBe(400);
    mocks.resolve.mockRejectedValueOnce(new Error("not owned")); expect((await preview(new Request(url))).status).toBe(400); expect(signed).not.toHaveBeenCalled();
  });
});
