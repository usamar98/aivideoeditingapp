import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { PricingCards } from "@/components/billing/pricing-cards";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";

describe("credit allowance menus", () => {
  it("highlights only the $49.99 Creator tier with a blue border and Popular badge", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards)));
    const creator = $("[data-pricing-tier='creator']");
    expect(creator.text()).toContain("$49.99");
    expect(creator.text()).toContain("Popular");
    expect(creator.hasClass("border-2")).toBe(true);
    expect(creator.hasClass("border-primary")).toBe(true);
    expect(creator.attr("style")).toContain("border-color:var(--primary)");
    expect($("[data-pricing-tier='starter']").text()).not.toContain("Popular");
    expect($("[data-pricing-tier='studio']").text()).not.toContain("Popular");
  });
  it("keeps the Popular badge visible when Creator is the selected plan", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { selectedTier: "creator" })));
    expect($("[data-pricing-tier='creator']").text()).toContain("Popular");
    expect($("[data-pricing-tier='creator']").text()).toContain("Your selection");
  });
  it.each([1, 2] as const)("enables the 2× choice only when its actual discounted price exists (available bundle %i)", (creditBundle) => {
    const plan: OfferedBillingPlan = { id: "price_test", name: "Creator", description: "", tierId: "creator", creditBundle, amount: creditBundle === 2 ? 64778 : 35988, credits: creditBundle === 2 ? 26400 : 13200, currency: "usd", interval: "year", intervalCount: 1 };
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { mode: "billing", plans: [plan], pending: false, demo: false, hasSubscription: false, onChoose: () => {}, selectedTier: "creator", initialQuantity: 2, initialInterval: "year" })));
    const button = $("select[aria-label='Creator credit allowance']").parent().parent().find("button");
    expect(button.length).toBe(1);
    expect(button.attr("disabled") !== undefined).toBe(creditBundle !== 2);
  });
  it("shows an accessible three-option credit menu on every plan, without the retired offer", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards)));
    expect($("select").length).toBe(3);
    for (const tier of ["Starter", "Creator", "Studio"]) {
      const select = $(`select[aria-label='${tier} credit allowance']`);
      expect(select.find("option").map((_, el) => $(el).attr("value")).get()).toEqual(["1", "2", "3"]);
      expect($(`label[for='${select.attr("id")}']`).text()).toBe("Choose your credits");
    }
    expect($.text()).toContain("10% off");
    expect($.text()).toContain("15% off");
    expect($.text()).not.toContain("Temporary offer");
    expect($.text()).not.toContain("one-time purchase");
  });
  it("restores only the selected tier's bundle and explains the annual total upfront", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { selectedTier: "creator", initialQuantity: 2, initialInterval: "year" })));
    expect($("select[aria-label='Creator credit allowance'] option[selected]").attr("value")).toBe("2");
    expect($("select[aria-label='Starter credit allowance'] option[selected]").attr("value")).toBe("1");
    expect($.text()).toContain("$53.98");
    expect($.text()).toContain("$647.78 billed yearly");
    expect($.text()).toContain("All 26,400 credits upfront");
    expect($("a").filter((_, el) => $(el).text().includes("Choose Creator")).attr("href")).toBe("/studio/profile?tab=billing&plan=creator&interval=year&quantity=2");
  });
});
