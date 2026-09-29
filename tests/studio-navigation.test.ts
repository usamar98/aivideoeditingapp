import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { AppSidebar } from "@/components/studio/app-sidebar";
import { WorkspaceShell } from "@/components/studio/workspace-shell";

describe("studio branding navigation", () => {
  it("keeps the desktop logo non-interactive without disabling workspace navigation", () => {
    const $ = load(renderToStaticMarkup(createElement(AppSidebar, { active: "Projects" })));
    expect($("aside > span img").length).toBe(1);
    expect($("aside img").closest("a, button, [role='button']").length).toBe(0);
    expect($("a[href='/']").length).toBe(0);
    expect($("a[href='/studio'][aria-current='page']").length).toBe(1);
    expect($("a[href='/studio/faceless']").length).toBe(1);
    expect($("a[href='/studio/profile']").length).toBe(1);
  });

  it("also keeps the mobile workspace logo non-interactive", () => {
    const $ = load(renderToStaticMarkup(WorkspaceShell({ title: "Studio", active: "Projects", children: "Workspace content" })));
    expect($("header img").length).toBe(1);
    expect($("header img").closest("a, button, [role='button']").length).toBe(0);
    expect($("a[href='/']").length).toBe(0);
    expect($("a[aria-label='Back to studio']").attr("href")).toBe("/studio");
  });
});
