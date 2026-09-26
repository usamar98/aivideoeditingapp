import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { creatorOffer, creatorOfferCheckout, creatorOfferRenewal, formatOfferCountdown, isCreatorOfferActive, isCreatorOfferPlan } from "@/lib/billing/creator-offer";
import { creatorOfferInvoiceCredits } from "@/lib/billing/creator-offer-invoice";
import { CreatorOfferBanner } from "@/components/billing/creator-offer-banner";
import { offerInvoice, offerLines, offerNow, offerPrices } from "./fixtures/creator-offer";

describe("fixed Creator campaign", () => {
  it("has one real 24-hour window shared by all visitors", () => {
    const start = Date.parse(creatorOffer.startsAt); const end = Date.parse(creatorOffer.endsAt);
    expect(end - start).toBe(24 * 60 * 60 * 1000);
    expect(isCreatorOfferActive(start - 1)).toBe(false);
    expect(isCreatorOfferActive(start)).toBe(true);
    expect(isCreatorOfferActive(end - 1)).toBe(true);
    expect(isCreatorOfferActive(end)).toBe(false);
    expect(isCreatorOfferActive(NaN)).toBe(false);
    expect(formatOfferCountdown(end - start)).toBe("24:00:00");
    expect(formatOfferCountdown(61_000)).toBe("00:01:01");
    expect(formatOfferCountdown(-1)).toBe("00:00:00");
  });
  it.each([["creator", "month", 1, true], ["creator", "year", 1, false], ["creator", "month", 2, false], ["creator", "month", 3, false], ["starter", "month", 1, false], ["studio", "month", 1, false]] as const)("eligibility is %s/%s/%i = %s", (tierId, interval, creditBundle, eligible) => {
    expect(isCreatorOfferPlan({ tierId, interval, creditBundle })).toBe(eligible);
  });
  it.each([["2026-12-31T12:00:00Z", "2027-02-28T12:00:00Z"], ["2027-12-31T12:00:00Z", "2028-02-29T12:00:00Z"], ["2026-09-26T12:00:00Z", "2026-11-26T12:00:00Z"]])("renews two calendar months after %s", (start, end) => {
    expect(creatorOfferRenewal(Date.parse(start))).toBe(Date.parse(end) / 1000);
  });
  it("charges 4999 cents once now and defers normal renewal by two months", () => {
    const fields = creatorOfferCheckout("price_creator", "prod_creator", "workspace_owned", offerNow);
    expect(fields.line_items).toEqual([{ price: "price_creator", quantity: 1 }, { price_data: { currency: "usd", unit_amount: 4999, product: "prod_creator" }, quantity: 1 }]);
    expect(fields.subscription_data?.trial_end).toBe(creatorOfferRenewal(offerNow));
    expect(fields.subscription_data?.metadata).toMatchObject({ offer_id: creatorOffer.id, workspace_id: "workspace_owned" });
    expect(fields.expires_at).toBe(Math.floor(offerNow / 1000) + 31 * 60);
    expect(fields.payment_method_collection).toBe("always");
    expect(fields.payment_method_types).toEqual(["card"]);
    expect(fields.custom_text?.submit && fields.custom_text.submit.message).toContain("1,100 credits included for that period");
  });
  it("refuses new offer checkouts at the deadline", () => {
    expect(() => creatorOfferCheckout("price_creator", "prod_creator", "workspace_owned", Date.parse(creatorOffer.endsAt))).toThrow("ended");
  });
  it("shows positive, clear offer copy and an accessible non-announcing timer", () => {
    const $ = load(renderToStaticMarkup(createElement(CreatorOfferBanner, { now: offerNow })));
    expect($.text()).toContain("Get your second month free");
    expect($.text()).toContain("1,100 credits included for the two-month period");
    expect($.text()).toContain("Then $49.99/month");
    expect($.text()).not.toContain("no extra credits");
    expect($("[role=timer]").attr("aria-live")).toBe("off");
    expect($("[role=timer]").text()).toBe("23:59:00");
    expect(renderToStaticMarkup(createElement(CreatorOfferBanner, { now: Date.parse(creatorOffer.endsAt) }))).toBe("");
  });
});

describe("paid offer invoice validation", () => {
  it("grants exactly 1100 once, not the recurring trial line plus the intro item", () => {
    expect(creatorOfferInvoiceCredits(offerInvoice(), offerLines(), offerPrices(), "workspace_owned")).toBe(1100);
  });
  it("does not apply the introductory grant to renewal invoices", () => {
    expect(creatorOfferInvoiceCredits(offerInvoice({ billing_reason: "subscription_cycle" }), offerLines(), offerPrices(), "workspace_owned")).toBeNull();
  });
  it.each([{ status: "open" as const }, { amount_paid: 0 }, { subtotal: 4998 }, { currency: "eur" }])("rejects invalid payment terms %j", (override) => {
    expect(() => creatorOfferInvoiceCredits(offerInvoice(override), offerLines(), offerPrices(), "workspace_owned")).toThrow("fixed terms");
  });
  it("rejects another workspace", () => {
    expect(() => creatorOfferInvoiceCredits(offerInvoice(), offerLines(), offerPrices(), "workspace_other")).toThrow("fixed terms");
  });
  it("honors delayed paid webhooks using the original immutable metadata", () => {
    const invoice = offerInvoice();
    invoice.created = Date.parse(creatorOffer.endsAt) / 1000 + 600;
    expect(creatorOfferInvoiceCredits(invoice, offerLines(), offerPrices(), "workspace_owned")).toBe(1100);
  });
  it.each(["offer_started_at", "offer_renewal_at", "offer_price_id", "offer_product_id"])("rejects altered %s", (key) => {
    const invoice = offerInvoice(); invoice.parent!.subscription_details!.metadata![key] = "invalid";
    expect(() => creatorOfferInvoiceCredits(invoice, offerLines(), offerPrices(), "workspace_owned")).toThrow("fixed terms");
  });
  it.each(["amount", "quantity", "product", "duplicate", "missing", "proration", "discount", "recurring"])("rejects altered invoice item: %s", (change) => {
    const prices = offerPrices(); const lines = offerLines();
    if (change === "amount") lines[1].amount = 4900;
    if (change === "quantity") lines[1].quantity = 2;
    if (change === "product") prices.get("price_intro")!.product = "prod_other";
    if (change === "duplicate") lines.push(lines[1]);
    if (change === "missing") lines.pop();
    if (change === "proration") lines[1].parent!.invoice_item_details!.proration = true;
    if (change === "discount") lines[1].discount_amounts = [{ amount: 1, discount: "di_other" }];
    if (change === "recurring") prices.get("price_creator")!.unit_amount = 2999;
    expect(() => creatorOfferInvoiceCredits(offerInvoice(), lines, prices, "workspace_owned")).toThrow("fixed terms");
  });
});
