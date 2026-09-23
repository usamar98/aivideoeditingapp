import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { planTerms, pricingAccountHref, pricingTiers } from "@/lib/billing/pricing";
import { toOfferedBillingPlan } from "@/lib/billing/catalog";
import { catalogEntries, syncStripeCatalog } from "../scripts/setup-stripe-pricing.mjs";

function priceFor(entry: ReturnType<typeof catalogEntries>[number]) {
  return {
    id: `price_${entry.tier.id}${entry.interval}`, active: true, currency: "usd",
    unit_amount: entry.amount, lookup_key: entry.lookupKey, billing_scheme: "per_unit",
    metadata: { credits: String(entry.credits) },
    recurring: { interval: entry.interval, interval_count: 1, usage_type: "licensed" },
    product: { id: entry.productId, active: true, name: entry.tier.name, description: "", metadata: { app: "framefoundry", tier: entry.tier.id } },
  } as unknown as Stripe.Price;
}

describe("three-tier monthly and annual pricing", () => {
  it("uses the requested prices and grants twelve months upfront yearly", () => {
    expect(pricingTiers.map((tier) => planTerms(tier, "month").amount)).toEqual([2999, 4999, 9999]);
    expect(pricingTiers.map((tier) => planTerms(tier, "month").credits)).toEqual([440, 1100, 2200]);
    expect(pricingTiers.map((tier) => planTerms(tier, "year").monthlyEquivalent)).toEqual([1999, 2999, 7999]);
    expect(pricingTiers.map((tier) => planTerms(tier, "year").amount)).toEqual([23988, 35988, 95988]);
    expect(pricingTiers.map((tier) => planTerms(tier, "year").credits)).toEqual([5280, 13200, 26400]);
  });

  it.each(catalogEntries())("accepts the exact $lookupKey Stripe price", (entry) => {
    const terms = planTerms(pricingTiers.find((tier) => tier.id === entry.tier.id)!, entry.interval as "month" | "year");
    expect(entry.amount).toBe(terms.amount);
    expect(entry.credits).toBe(terms.credits);
    expect(toOfferedBillingPlan(priceFor(entry))).toMatchObject({ tierId: entry.tier.id, amount: terms.amount, credits: terms.credits, interval: entry.interval });
  });

  it("rejects mismatched amounts, allocations, currency, intervals, and arbitrary old plans", () => {
    const price = priceFor(catalogEntries()[0]);
    const wrongPrices = [
      { ...price, unit_amount: 1999 }, { ...price, metadata: { credits: "5280" } },
      { ...price, currency: "eur" }, { ...price, lookup_key: null }, { ...price, active: false },
      { ...price, recurring: { ...price.recurring!, interval_count: 12 } },
      { ...price, recurring: { ...price.recurring!, interval: "year" as const } },
      { ...price, recurring: { ...price.recurring!, usage_type: "metered" as const } },
      { ...price, transform_quantity: { divide_by: 100, round: "up" as const } },
    ];
    for (const invalid of wrongPrices) expect(toOfferedBillingPlan(invalid)).toBeNull();
  });

  it("keeps the selected tier and annual interval in the account link", () => {
    expect(pricingAccountHref("creator", "year")).toBe("/studio/profile?tab=billing&plan=creator&interval=year");
  });
});

describe("safe Stripe catalog setup", () => {
  function provider(prices: Stripe.Price[] = []) {
    return {
      prices: {
        list: async function* () { yield* prices; },
        create: vi.fn().mockResolvedValue({ id: "price_new" }),
      },
      products: {
        retrieve: vi.fn().mockRejectedValue({ code: "resource_missing", statusCode: 404 }),
        create: vi.fn().mockImplementation(async (input) => ({ ...input, active: true })),
      },
    };
  }

  it("creates exactly three products and six prices with immutable allocations", async () => {
    const stripe = provider();
    expect(await syncStripeCatalog(stripe)).toHaveLength(6);
    expect(stripe.products.create).toHaveBeenCalledTimes(3);
    expect(stripe.prices.create).toHaveBeenCalledTimes(6);
    expect(stripe.prices.create).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: 95988, recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }, metadata: { credits: "26400" } }), expect.objectContaining({ idempotencyKey: "catalog:price:framefoundry_studio_year_v1" }));
  });

  it("reuses an existing catalog without mutating anything", async () => {
    const stripe = provider(catalogEntries().map(priceFor));
    expect((await syncStripeCatalog(stripe)).every((result: { status: string }) => result.status === "existing")).toBe(true);
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("stops before any writes if an existing price has the wrong allocation", async () => {
    const price = priceFor(catalogEntries()[1]);
    const stripe = provider([{ ...price, metadata: { credits: "440" } }]);
    await expect(syncStripeCatalog(stripe)).rejects.toThrow("Catalog mismatch");
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("never turns an authentication error into a create request", async () => {
    const stripe = provider();
    stripe.products.retrieve.mockRejectedValue({ code: "authentication_error", statusCode: 401 });
    await expect(syncStripeCatalog(stripe)).rejects.toMatchObject({ statusCode: 401 });
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });
});
