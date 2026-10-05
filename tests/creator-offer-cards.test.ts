import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { PricingCards } from "@/components/billing/pricing-cards";

vi.mock("@/components/billing/creator-offer-banner", () => ({ useCreatorOfferClock: () => ({ now: 0, active: true }) }));

describe("retired introductory campaign", () => {
  it.each(["month", "year"] as const)("does not advertise expired two-month terms on %s cards", (initialInterval) => {
    const $ = load(renderToStaticMarkup(createElement(PricingCards, { initialInterval })));
    expect($("[data-testid='creator-offer']").length).toBe(0);
    expect($.text()).not.toContain("two-month");
    expect($.text()).not.toContain("Claim Creator offer");
    expect($.text()).not.toContain("Then $15");
    expect($("[data-pricing-tier='creator'] a").attr("href")).toBe(`/studio/profile?tab=billing&plan=creator&interval=${initialInterval}`);
  });
});
