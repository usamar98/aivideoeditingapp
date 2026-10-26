import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { TikTokDashboardData } from "@/lib/social/tiktok-types";
vi.mock("@/app/studio/social/tiktok/actions", () => ({ cancelTikTokPost: vi.fn(), disconnectTikTok: vi.fn(), publishToTikTok: vi.fn(), refreshTikTokPost: vi.fn() }));
import { TikTokDashboard } from "@/components/studio/tiktok-dashboard";
import { SocialPlatformTabs } from "@/components/studio/social-platform-tabs";
const initial: TikTokDashboardData = { demo: true, configured: false, publishingEnabled: false, publicPosting: false, error: null, connection: null, creator: null, videos: [], posts: [] };
const connected: TikTokDashboardData = { ...initial, demo: false, configured: true, publishingEnabled: true, connection: { display_name: "Creator", username: "creator", status: "connected" }, creator: { creator_username: "creator", creator_nickname: "Creator Nickname", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], comment_disabled: true, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 60 } };
describe("TikTok posting controls", () => {
  it("adds a third navigation tab without removing existing publishing routes", () => {
    const $ = load(renderToStaticMarkup(createElement(SocialPlatformTabs, { active: "tiktok" })));
    expect($("a").map((_, el) => $(el).attr("href")).get()).toEqual(["/studio/social", "/studio/social/facebook", "/studio/social/tiktok"]); expect($("[aria-current=page]").text()).toBe("TikTok");
  });
  it("honestly disables demo and unconfigured connection/publishing", () => {
    const $ = load(renderToStaticMarkup(createElement(TikTokDashboard, { initial, notice: null })));
    expect($("fieldset").first().attr("disabled")).toBeDefined(); expect($("form[action='/api/social/tiktok/connect'] button").attr("disabled")).toBeDefined(); expect($("main").text()).toContain("no TikTok account is connected"); expect($("main").text()).toContain("Private testing only");
  });
  it("shows creator nickname, unselected privacy, all interactions off, provider-disabled controls and explicit consent", () => {
    const $ = load(renderToStaticMarkup(createElement(TikTokDashboard, { initial: { ...connected, publicPosting: true }, notice: null })));
    expect($("#tiktok-account-heading").text()).toBe("Creator Nickname");
    const privacy = $("select").filter((_, el) => $(el).text().includes("Choose privacy")); expect(privacy.find("option[selected]").attr("value")).toBe(""); expect(privacy.find("option").map((_, el) => $(el).attr("value")).get()).toEqual(["", "PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
    expect($("input[type=checkbox][checked]")).toHaveLength(0); expect($("input[type=checkbox][disabled]")).toHaveLength(2); expect($("input[type=checkbox][required]")).toHaveLength(2);
    expect($("button[type=submit]").attr("disabled")).toBeDefined(); expect($("main").text()).toContain("Music Usage Confirmation"); expect($("main").text()).toContain("few minutes");
  });
  it("gates public-account unaudited tests to Only me and warns about account privacy", () => {
    const $ = load(renderToStaticMarkup(createElement(TikTokDashboard, { initial: connected, notice: null })));
    const privacy = $("select").filter((_, el) => $(el).text().includes("Choose privacy")); expect(privacy.find("option").map((_, el) => $(el).attr("value")).get()).toEqual(["", "SELF_ONLY"]); expect($("main").text()).toContain("Set your TikTok account to private");
  });
  it("does not offer cancellation after init intent, even without a saved provider ID", () => {
    const data = { ...initial, posts: [{ id: "post", caption: "Caption", privacy: "SELF_ONLY" as const, status: "needs_attention" as const, scheduled_at: null, init_started_at: "2026-10-27T00:00:00Z", error_message: "Uncertain", created_at: "2026-10-27T00:00:00Z", tiktokUrl: null }] };
    const $ = load(renderToStaticMarkup(createElement(TikTokDashboard, { initial: data, notice: null })));
    expect($("article button").text()).not.toContain("Cancel"); expect($("article").text()).toContain("may already have received");
  });
});
