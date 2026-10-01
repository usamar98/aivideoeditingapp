import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { FacebookDashboardData } from "@/lib/social/facebook-types";
vi.mock("@/app/studio/social/facebook/actions", () => ({ cancelFacebookPost: vi.fn(), disconnectFacebook: vi.fn(), publishToFacebook: vi.fn(), refreshFacebookPost: vi.fn(), selectFacebookPage: vi.fn() }));
import { FacebookDashboard } from "@/components/studio/facebook-dashboard";
const initial: FacebookDashboardData = { demo: true, configured: false, publishingEnabled: false, error: null, connection: null, pages: [], posts: [], videos: [] };
describe("Facebook dashboard", () => {
  it("honestly disables demo connection/publishing and shows its format and public visibility limits", () => {
    const $ = load(renderToStaticMarkup(createElement(FacebookDashboard, { initial, notice: null })));
    expect($("h1").text()).toContain("your Page"); expect($("fieldset").attr("disabled")).toBeDefined();
    expect($("form[action='/api/social/facebook/connect'] button").attr("disabled")).toBeDefined();
    expect($("main").text()).toContain("not a private test-upload"); expect($("main").text()).toContain("4–60 seconds");
    expect($("main").text()).toContain("Personal-profile posting is not supported");
  });
  it("requires explicit public-post rights, AI choice and video selection for a connected account", () => {
    const data = { ...initial, demo: false, configured: true, publishingEnabled: true, connection: { page_id: "222", page_name: "Test Page", status: "connected" as const } };
    const $ = load(renderToStaticMarkup(createElement(FacebookDashboard, { initial: data, notice: null })));
    expect($("fieldset").attr("disabled")).toBeUndefined(); expect($("fieldset input[type=checkbox][required]")).toHaveLength(1);
    expect($("fieldset select[required]")).toHaveLength(2); expect($("fieldset button[type=submit]").text()).toContain("public Facebook");
    expect($("fieldset").text()).toContain("Test Page");
  });
  it("never offers cancellation once a finish request may be in flight", () => {
    const data: FacebookDashboardData = { ...initial, posts: [{ id: "job", title: "A Reel", status: "publishing", scheduled_at: null, created_at: "2026-09-27T00:00:00Z", finish_started_at: "2026-09-27T00:00:00Z", error_message: "Checking result", facebookUrl: "https://www.facebook.com/reel/444" }] };
    const $ = load(renderToStaticMarkup(createElement(FacebookDashboard, { initial: data, notice: null })));
    expect($("article button").text()).not.toContain("Cancel"); expect($("article").text()).toContain("may already have received");
  });
});
