import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/marketing/site-header";
import { headerIsScrolled, headerServerSnapshot, subscribeHeaderScroll } from "@/components/marketing/header-scroll";

afterEach(() => vi.unstubAllGlobals());

describe("floating public header", () => {
  it("server-renders the full header and reserves space without needing window", () => {
    const $ = load(renderToStaticMarkup(createElement(SiteHeader, { home: true })));
    expect($("header[data-site-header]").length).toBe(1);
    expect($("header").attr("data-scrolled")).toBe("false");
    expect($("header").parent().is("div")).toBe(true);
    expect($("a[aria-label='Create AI Videos home'] img").length).toBe(1);
    expect($("nav[aria-label='Main navigation'] a").map((_, el) => $(el).attr("href")).get())
      .toEqual(["/features", "#how-it-works", "/pricing", "/guides"]);
    expect($("a[href='/studio']").text()).toContain("Open studio");
    expect($("a[href='/login']").length).toBe(2);
  });

  it("keeps public-page links correct when the homepage anchor is absent", () => {
    const $ = load(renderToStaticMarkup(createElement(SiteHeader)));
    expect($("nav[aria-label='Main navigation'] a").map((_, el) => $(el).attr("href")).get())
      .toEqual(["/features", "/pricing", "/guides"]);
    expect($("a[href='#how-it-works']").length).toBe(0);
    expect($("nav[aria-label='Main navigation']").text()).toContain("Features");
  });

  it("provides a named mobile disclosure with the same links and a closed initial state", () => {
    const $ = load(renderToStaticMarkup(createElement(SiteHeader, { home: true })));
    const toggle = $("button[aria-label='Open navigation menu']");
    const menu = $("nav[aria-label='Mobile navigation']");
    expect(toggle.attr("type")).toBe("button");
    expect(toggle.attr("aria-expanded")).toBe("false");
    expect(toggle.attr("aria-controls")).toBe(menu.attr("id"));
    expect(menu.attr("hidden")).toBeDefined();
    expect(menu.find("a").map((_, el) => $(el).attr("href")).get())
      .toEqual(["/features", "#how-it-works", "/pricing", "/guides", "/login"]);
  });

  it("keeps server markup hydration-safe even when the browser restores a scrolled page", () => {
    vi.stubGlobal("window", { scrollY: 900 });
    expect(headerIsScrolled()).toBe(true);
    const $ = load(renderToStaticMarkup(createElement(SiteHeader)));
    expect($("header").attr("data-scrolled")).toBe("false");
    expect(headerServerSnapshot()).toBe(false);
  });

  it.each([[0, false], [-10, false], [24, false], [25, true], [1800, true]])("derives compact state at scrollY=%s", (scrollY, compact) => {
    vi.stubGlobal("window", { scrollY });
    expect(headerIsScrolled()).toBe(compact);
  });

  it("subscribes passively to scroll and cleans up both listeners on unmount", () => {
    const target = new EventTarget();
    const add = vi.spyOn(target, "addEventListener");
    const remove = vi.spyOn(target, "removeEventListener");
    vi.stubGlobal("window", target);
    const onChange = vi.fn();
    const cleanup = subscribeHeaderScroll(onChange);
    expect(add).toHaveBeenCalledWith("scroll", onChange, { passive: true });
    expect(add).toHaveBeenCalledWith("pageshow", onChange);
    target.dispatchEvent(new Event("scroll"));
    target.dispatchEvent(new Event("pageshow"));
    expect(onChange).toHaveBeenCalledTimes(2);
    cleanup();
    expect(remove).toHaveBeenCalledWith("scroll", onChange);
    expect(remove).toHaveBeenCalledWith("pageshow", onChange);
    target.dispatchEvent(new Event("scroll"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("keeps the pill fixed, responsive, legible without blur, and reduced-motion friendly", () => {
    const css = readFileSync(join(process.cwd(), "src/components/marketing/site-header.module.css"), "utf8");
    expect(css).toContain("position: fixed");
    expect(css).toContain(".space { height: 80px; }");
    expect(css).toContain('.header[data-scrolled="true"] .surface');
    expect(css).toContain("border-radius: 999px");
    expect(css).toContain("background: rgb(255 253 248 / 96%)");
    expect(css).toContain("backdrop-filter: blur(16px)");
    expect(css).toContain("@media (min-width: 1024px)");
    expect(css).toContain(".mobileMenu[hidden] { display: none; }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none");
    const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(globals).toContain("html:has([data-site-header]) { scroll-padding-top: 112px; }");
  });
});
