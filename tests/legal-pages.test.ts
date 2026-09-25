import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/config/brand", () => ({ brand: {
  name: "ETA", shortName: "ETA", siteUrl: "https://www.editingapp.live", supportEmail: "support@editingapp.live",
} }));

import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import { SiteFooter } from "@/components/marketing/site-chrome";
import { AuthForm } from "@/components/studio/auth-form";
import { publicPages } from "@/lib/seo/site";

describe("public legal pages", () => {
  it.each([
    ["/privacy", "Privacy Policy", PrivacyPage, privacyMetadata],
    ["/terms", "Terms of Service", TermsPage, termsMetadata],
  ] as const)("renders %s with complete content and its own metadata", (path, title, Page, metadata) => {
    const $ = load(renderToStaticMarkup(createElement(Page)));
    expect($("main h1").length).toBe(1);
    expect($("main h1").text()).toBe(title);
    expect($("main section").length).toBeGreaterThanOrEqual(10);
    expect($("time").attr("datetime")).toBe("2026-09-25");
    expect($("main a[href='mailto:support@editingapp.live']").length).toBeGreaterThan(0);
    expect(metadata.alternates?.canonical).toBe(`https://www.editingapp.live${path}`);
    expect(metadata.title).toEqual({ absolute: `${title} | ETA` });
    expect(publicPages.some((page) => page.path === path)).toBe(true);
    const toc = $("nav[aria-label='On this page'] a");
    expect(toc.length).toBe($("main section").length);
    toc.each((_, link) => {
      const section = $($(link).attr("href")!);
      expect(section.length).toBe(1);
      expect($(`#${section.attr("aria-labelledby")}`).length).toBe(1);
    });
    const ids = $("[id]").map((_, element) => $(element).attr("id")).get();
    expect(new Set(ids).size).toBe(ids.length);
    const schemas = $("script[type='application/ld+json']").map((_, element) => JSON.parse($(element).text())).get();
    expect(schemas).toEqual(expect.arrayContaining([expect.objectContaining({ "@type": "WebPage", url: `https://www.editingapp.live${path}` })]));
  });

  it("explains Google scope limits, AI processing and support-based deletion", () => {
    const $ = load(renderToStaticMarkup(createElement(PrivacyPage)));
    expect($("#google").text()).toContain("does not give ETA access to your Gmail");
    expect($("#google").text()).toContain("not for advertising or AI model training");
    expect($("#google a").attr("href")).toBe("https://myaccount.google.com/connections");
    for (const provider of ["Supabase", "Vercel", "Trigger.dev", "fal.ai", "Gemini", "ElevenLabs", "Stripe"]) {
      expect($("#providers").text()).toContain(provider);
    }
    expect($("#rights").text()).toContain("not an automatic self-service button");
    expect($("#rights").text()).toContain("deletion");
  });

  it("distinguishes subscription cancellation, credit returns and cash refunds", () => {
    const $ = load(renderToStaticMarkup(createElement(TermsPage)));
    expect($("#billing").text()).toContain("renew");
    expect($("#credits").text()).toContain("full year’s credits upfront");
    expect($("#credits").text()).toContain("not a refund of a subscription payment");
    expect($("#cancellation").text()).toContain("Cancelling a generation job does not cancel your subscription");
    expect($("#responsibility").text()).toContain("cannot legally be excluded");
  });

  it("links both policies from the shared homepage footer", () => {
    const $ = load(renderToStaticMarkup(createElement(SiteFooter)));
    expect($("footer a[href='/privacy']").text()).toBe("Privacy Policy");
    expect($("footer a[href='/terms']").text()).toBe("Terms of Service");
  });

  it("shows both policy links before either sign-up method without submitting a form", () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { nextPath: "/studio", demoMode: false }));
    const $ = load(html);
    for (const path of ["/privacy", "/terms"]) {
      const link = $(`a[href='${path}']`);
      expect(link.attr("target")).toBe("_blank");
      expect(link.attr("rel")).toContain("noopener");
      expect(html.indexOf(`href="${path}"`)).toBeLessThan(html.indexOf("Continue with Google"));
    }
    expect($("form a").length).toBe(0);
    expect($("button[type='submit']").text()).toContain("Sign in");
  });
});
