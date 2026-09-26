import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creatorOffer } from "@/lib/billing/creator-offer";
import { offerNow } from "./fixtures/creator-offer";
import { PricingCards } from "@/components/billing/pricing-cards";
const clock = vi.hoisted(() => ({ now: 0, active: true }));
vi.mock("@/components/billing/creator-offer-banner", async (original) => ({ ...await original<typeof import("@/components/billing/creator-offer-banner")>(), useCreatorOfferClock: () => clock }));
beforeEach(() => { clock.now = offerNow; clock.active = true; });
describe("Creator offer card visibility", () => {
  it("shows the offer only in the base monthly Creator card with the total allocation", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards)));
    expect($("[data-testid='creator-offer']").length).toBe(1);
    const card = $("[data-pricing-tier='creator']");
    expect(card.text()).toContain("Popular"); expect(card.text()).toContain("two-month period");
    expect(card.text()).toContain("Claim Creator offer"); expect(card.text()).not.toContain("1,100credits / month");
    expect(card.text()).toContain("/ first two months");
    expect(card.find("select option[selected]").text()).toBe("1,100 credits · Two-month offer");
  });
  it.each([2, 3] as const)("does not imply the offer is included with the %i× bundle", (initialQuantity) => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { selectedTier: "creator", initialQuantity })));
    expect($("[data-testid='creator-offer']").length).toBe(0);
    expect($.text()).not.toContain("Claim Creator offer");
  });
  it("does not advertise the offer on annual plans", () => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { initialInterval: "year" })));
    expect($("[data-testid='creator-offer']").length).toBe(0);
    expect($.text()).toContain("All 13,200 credits upfront");
  });
  it.each([true, false])("hides the offer for ineligible accounts (active subscription %s)", (hasSubscription) => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { mode: "billing", plans: [], pending: false, demo: false, hasSubscription, offerEligible: false, onChoose: () => {} })));
    expect($("[data-testid='creator-offer']").length).toBe(0);
  });
  it("returns to regular pricing and credit terms at expiry", () => {
    clock.now = Date.parse(creatorOffer.endsAt); clock.active = false;
    const $ = load(renderToStaticMarkup(createElement(PricingCards)));
    expect($("[data-testid='creator-offer']").length).toBe(0);
    expect($("[data-pricing-tier='creator']").text()).toContain("$49.99 billed monthly");
    expect($("[data-pricing-tier='creator']").text()).toContain("1,100 credits after each successful monthly payment");
  });
});
