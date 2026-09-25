import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { PricingCards } from "@/components/billing/pricing-cards";

describe("credit allowance menus", () => {
  it("shows an accessible three-option credit menu on every plan, without the retired offer", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards)));
    expect($("select").length).toBe(3);
    for (const tier of ["Starter", "Creator", "Studio"]) {
      const select = $(`select[aria-label='${tier} credit allowance']`);
      expect(select.find("option").map((_, el) => $(el).attr("value")).get()).toEqual(["1", "2", "3"]);
      expect($(`label[for='${select.attr("id")}']`).text()).toBe("Choose your credits");
    }
    expect($.text()).not.toContain("Temporary offer");
    expect($.text()).not.toContain("one-time purchase");
  });
  it("restores only the selected tier's bundle and explains the annual total upfront", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { selectedTier: "creator", initialQuantity: 2, initialInterval: "year" })));
    expect($("select[aria-label='Creator credit allowance'] option[selected]").attr("value")).toBe("2");
    expect($("select[aria-label='Starter credit allowance'] option[selected]").attr("value")).toBe("1");
    expect($.text()).toContain("$59.98");
    expect($.text()).toContain("$719.76 billed yearly");
    expect($.text()).toContain("All 26,400 credits upfront");
    expect($("a").filter((_, el) => $(el).text().includes("Choose Creator")).attr("href")).toBe("/studio/profile?tab=billing&plan=creator&interval=year&quantity=2");
  });
});
