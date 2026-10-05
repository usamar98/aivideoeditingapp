import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { PricingCards } from "@/components/billing/pricing-cards";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";

const render = (props: Parameters<typeof PricingCards>[0] = {}) => load(renderToStaticMarkup(createElement(PricingCards, props)));

describe("reference-style pricing cards", () => {
  it("shows Creator at $9, Growth at $49 and Enterprise as custom", () => {
    const $ = render();
    expect($("[data-pricing-tier]").length).toBe(3);
    expect($("[data-pricing-tier='creator']").text()).toContain("$9");
    expect($("[data-pricing-tier='growth']").text()).toContain("$49");
    expect($("[data-pricing-tier='enterprise']").text()).toContain("Custom");
    expect($("[data-pricing-tier='enterprise'] a").attr("href")).toBe("/contact");
    expect($("[data-pricing-tier='enterprise'] input").length).toBe(0);
    expect($.text()).not.toContain("Then $15");
  });

  it("puts the full-width popular header only on Growth while preserving ETA's theme", () => {
    const $ = render({ selectedTier: "growth" });
    const growth = $("[data-pricing-tier='growth']");
    expect(growth.text()).toContain("MOST POPULAR");
    expect(growth.text()).toContain("Your selection");
    expect(growth.hasClass("border-primary")).toBe(true);
    expect(growth.hasClass("bg-card")).toBe(true);
    expect($("[data-pricing-tier='creator']").text()).not.toContain("MOST POPULAR");
    expect(growth.find("a").text()).toBe("Get Started");
    expect(growth.html()!.indexOf("Get Started")).toBeLessThan(growth.html()!.indexOf("Plan Includes:"));
  });

  it("provides keyboard-accessible sliders and three credit pills on both paid cards", () => {
    const $ = render();
    expect($("select").length).toBe(0);
    expect($("input[type='range']").length).toBe(2);
    for (const [tier, credits] of [["creator", "200"], ["growth", "1,100"]]) {
      const card = $(`[data-pricing-tier='${tier}']`);
      expect(card.find("input[type='radio']").length).toBe(3);
      expect(card.find("input[type='range']").attr("aria-valuetext")).toBe(`${credits} credits`);
      expect(card.find("input[type='radio'][checked]").attr("value")).toBe("1");
    }
    expect($.text()).not.toContain("Brand Machine");
    expect($.text()).not.toContain("Unlimited");
  });

  it("restores the chosen bundle and explains annual payment and upfront credits", () => {
    const $ = render({ selectedTier: "growth", initialQuantity: 2, initialInterval: "year" });
    const growth = $("[data-pricing-tier='growth']");
    expect(growth.find("input[type='range']").attr("value")).toBe("1");
    expect(growth.find("input[type='radio'][checked]").attr("value")).toBe("2");
    expect($("[data-pricing-tier='creator'] input[type='radio'][checked]").attr("value")).toBe("1");
    expect(growth.text()).toContain("$70.56");
    expect(growth.text()).toContain("$846.72 billed yearly");
    expect(growth.text()).toContain("All 26,400 credits upfront");
    expect(growth.find("a").attr("href")).toBe("/studio/profile?tab=billing&plan=growth&interval=year&quantity=2");
  });

  it.each([1, 2] as const)("enables checkout only for the matching %i bundle", (creditBundle) => {
    const plan: OfferedBillingPlan = { id: "price_test", name: "Growth", description: "", tierId: "growth", creditBundle, amount: creditBundle === 2 ? 84672 : 47040, credits: creditBundle === 2 ? 26400 : 13200, currency: "usd", interval: "year", intervalCount: 1 };
    const $ = render({ mode: "billing", plans: [plan], pending: false, demo: false, hasSubscription: false, onChoose: () => {}, selectedTier: "growth", initialQuantity: 2, initialInterval: "year" });
    expect($("[data-pricing-tier='growth'] [data-pricing-checkout]").attr("disabled") !== undefined).toBe(creditBundle !== 2);
  });

  it("does not enable checkout when a returned price disagrees with the card", () => {
    const plan: OfferedBillingPlan = { id: "price_old", name: "Creator", description: "", tierId: "creator", creditBundle: 1, amount: 4999, credits: 1100, currency: "usd", interval: "month", intervalCount: 1 };
    const $ = render({ mode: "billing", plans: [plan], pending: false, demo: false, hasSubscription: false, onChoose: () => {} });
    expect($("[data-pricing-tier='creator'] [data-pricing-checkout]").attr("disabled")).toBeDefined();
  });

  it.each([{ pending: true, demo: false, hasSubscription: false }, { pending: false, demo: true, hasSubscription: false }, { pending: false, demo: false, hasSubscription: true }])("preserves checkout safety in %j", (state) => {
    const $ = render({ mode: "billing", plans: [], ...state, onChoose: () => {} });
    expect($("[data-pricing-checkout]:disabled").length).toBe(2);
    expect($("[data-pricing-tier='enterprise'] a").attr("href")).toBe("/contact");
    if (state.pending) expect($("fieldset[disabled]").length).toBe(2);
  });
});
