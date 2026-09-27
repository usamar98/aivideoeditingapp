import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { SocialDashboard } from "@/lib/social/types";
vi.mock("@/app/studio/social/actions", () => ({ publishToYouTube: vi.fn(), cancelYouTubePost: vi.fn(), refreshYouTubePost: vi.fn(), disconnectYouTube: vi.fn() }));
import { YouTubeDashboard } from "@/components/studio/youtube-dashboard";
import Privacy from "@/app/privacy/page";
import Terms from "@/app/terms/page";
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const initial: SocialDashboard = { demo: true, configured: false, publicPublishing: false, error: null, connection: null, videos: [], posts: [] };
describe("YouTube dashboard and disclosures", () => {
  it("makes fixture mode unmistakable and disables connect/upload without credentials", () => {
    const $ = load(renderToStaticMarkup(createElement(YouTubeDashboard, { initial, notice: null })));
    expect($("h1")).toHaveLength(1); expect($.text()).toContain("Demo preview");
    expect($("form[action='/api/social/youtube/connect'] button").attr("disabled")).toBeDefined();
    expect($("fieldset").attr("disabled")).toBeDefined(); expect($("fieldset input[type=checkbox]").attr("checked")).toBeUndefined();
    expect($("a[href='/privacy#youtube']").length).toBeGreaterThan(0);
  });
  it("shows separate connection consent, safe private defaults and explicit disclosure choices", () => {
    const connected = { ...initial, demo: false, configured: true, publicPublishing: true, connection: { channel_id: "UCtest", channel_title: "My channel", status: "connected" as const } };
    const $ = load(renderToStaticMarkup(createElement(YouTubeDashboard, { initial: connected, notice: null })));
    expect($("fieldset").attr("disabled")).toBeUndefined();
    expect($("option[value=private]").attr("selected")).toBeDefined();
    for (const value of ["private", "public", "unlisted", "schedule"]) expect($(`option[value=${value}]`).attr("disabled")).toBeUndefined();
    expect($.text()).toContain("Is this video made for kids?"); expect($.text()).toContain("realistic altered or synthetic");
    expect($("textarea").attr("maxlength")).toBe("5000");
    // Keep submit available for native required-field validation instead of silently disabling it.
    expect($("fieldset button[type=submit]").attr("disabled")).toBeUndefined();
    expect($("#youtube-upload-checklist").text()).toContain("Choose Yes or No for realistic altered / AI-generated content.");
    for (const id of ["youtube-video", "youtube-title", "youtube-kids", "youtube-synthetic", "youtube-consent"]) {
      expect($(`#${id}`).attr("required")).toBeDefined();
    }
    expect($("#youtube-synthetic option[value='']").attr("selected")).toBeDefined();
    expect($("#youtube-consent").attr("checked")).toBeUndefined();
    expect($("fieldset button[type=submit]").attr("aria-describedby")).toBe("youtube-upload-checklist");
  });
  it("keeps public publishing and scheduling disabled during private-only testing", () => {
    const connected = { ...initial, demo: false, configured: true, connection: { channel_id: "UCtest", channel_title: "My channel", status: "connected" as const } };
    const $ = load(renderToStaticMarkup(createElement(YouTubeDashboard, { initial: connected, notice: null })));
    for (const value of ["public", "unlisted", "schedule"]) expect($(`option[value=${value}]`).attr("disabled")).toBeDefined();
    expect($("option[value=private]").attr("disabled")).toBeUndefined();
    expect($("fieldset button[type=submit]").text()).toContain("Upload privately to YouTube");
  });
  it("explains API data, revocation, Limited Use and native schedules", () => {
    const privacy = load(renderToStaticMarkup(createElement(Privacy))), terms = load(renderToStaticMarkup(createElement(Terms)));
    expect(privacy("#youtube").text()).toContain("YouTube API Services");
    expect(privacy("#youtube a[href='https://policies.google.com/privacy']")).toHaveLength(1);
    expect(privacy("#youtube").text()).toContain("Limited Use");
    expect(terms("#youtube a[href='https://www.youtube.com/t/terms']")).toHaveLength(1);
    expect(terms("#youtube").text()).toContain("does not delete YouTube videos or cancel schedules");
  });
});
