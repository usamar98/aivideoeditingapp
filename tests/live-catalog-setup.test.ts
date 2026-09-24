import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { runLiveCatalogSetup } from "@/lib/billing/live-catalog-setup";
import { catalogEntries } from "@/lib/billing/setup-stripe-catalog.mjs";

const apply = { mode: "apply", confirmation: "create-framefoundry-live-plans" };
const inspect = { mode: "inspect" };

function provider() {
  const prices: Stripe.Price[] = [];
  const products = new Map<string, Stripe.Product>();
  const client = {
    prices: {
      list: vi.fn().mockImplementation(async function* () { yield* prices; }),
      create: vi.fn().mockImplementation(async (input) => {
        const price = {
          ...input, id: `price_${prices.length}`, active: true, livemode: true,
          billing_scheme: "per_unit", product: products.get(input.product),
        };
        prices.push(price);
        return price;
      }),
    },
    products: {
      retrieve: vi.fn().mockImplementation(async (id) => {
        if (!products.has(id)) throw { code: "resource_missing", statusCode: 404 };
        return products.get(id);
      }),
      create: vi.fn().mockImplementation(async (input) => {
        const product = { ...input, active: true, livemode: true };
        products.set(input.id, product);
        return product;
      }),
    },
  };
  return {
    client, prices, products,
    options: {
      environmentType: "PRODUCTION", secretKey: "sk_live_mock_only",
      createClient: vi.fn(() => client as unknown as Stripe),
    },
  };
}

describe("server-only live catalog setup", () => {
  it.each([undefined, {}, { mode: "apply" }, { ...apply, confirmation: "yes" }, { ...apply, amount: 1 }, { mode: "inspect", secretKey: "untrusted" }])(
    "rejects unconfirmed or arbitrary payloads before any API call: %j", async (payload) => {
      const fake = provider();
      expect(await runLiveCatalogSetup(payload, fake.options)).toEqual({ ok: false, code: "invalid_request" });
      expect(fake.options.createClient).not.toHaveBeenCalled();
    },
  );

  it.each(["DEVELOPMENT", "STAGING", "PREVIEW"])("rejects %s", async (environmentType) => {
    const fake = provider();
    expect(await runLiveCatalogSetup(apply, { ...fake.options, environmentType })).toEqual({ ok: false, code: "production_only" });
    expect(fake.options.createClient).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "  ", "sk_test_mock", "pk_live_mock", "whsec_mock"])("rejects missing/non-live server credentials", async (secretKey) => {
    const fake = provider();
    expect(await runLiveCatalogSetup(apply, { ...fake.options, secretKey })).toMatchObject({ ok: false });
    expect(fake.options.createClient).not.toHaveBeenCalled();
  });

  it("inspects missing plans without creating anything", async () => {
    const fake = provider();
    const result = await runLiveCatalogSetup(inspect, fake.options);
    expect(result).toMatchObject({ ok: true, mode: "inspect", ready: false });
    expect(result.plans).toHaveLength(6);
    expect(result.plans?.every((plan) => plan.status === "missing")).toBe(true);
    expect(fake.client.prices.create).not.toHaveBeenCalled();
    expect(fake.client.products.create).not.toHaveBeenCalled();
  });

  it("creates exactly the requested catalog, verifies it, then safely reuses it", async () => {
    const fake = provider();
    const result = await runLiveCatalogSetup(apply, fake.options);
    expect(result).toMatchObject({ ok: true, ready: true });
    expect(result.plans?.map((plan) => [plan.amount, plan.credits])).toEqual([
      [2999, 440], [23988, 5280], [4999, 1100], [35988, 13200], [9999, 2200], [95988, 26400],
    ]);
    expect(fake.client.products.create).toHaveBeenCalledTimes(3);
    expect(fake.client.prices.create).toHaveBeenCalledTimes(6);
    expect(await runLiveCatalogSetup(apply, fake.options)).toMatchObject({ ok: true, ready: true });
    expect(fake.client.products.create).toHaveBeenCalledTimes(3);
    expect(fake.client.prices.create).toHaveBeenCalledTimes(6);
    expect(await runLiveCatalogSetup(inspect, fake.options)).toMatchObject({ ok: true, ready: true });
    expect(JSON.stringify(result)).not.toContain(fake.options.secretKey);
  });

  it.each(["amount", "credits", "livemode", "active"])("refuses a %s conflict before any write", async (field) => {
    const fake = provider();
    await runLiveCatalogSetup(apply, fake.options);
    // Simulate a partially provisioned catalog with one conflicting entry.
    fake.prices.splice(1);
    if (field === "amount") fake.prices[0].unit_amount = 1;
    if (field === "credits") fake.prices[0].metadata.credits = "1";
    if (field === "livemode") fake.prices[0].livemode = false;
    if (field === "active") fake.prices[0].active = false;
    fake.client.prices.create.mockClear();
    fake.client.products.create.mockClear();
    expect(await runLiveCatalogSetup(apply, fake.options)).toMatchObject({ ok: false, code: "catalog_conflict" });
    expect(fake.client.prices.create).not.toHaveBeenCalled();
    expect(fake.client.products.create).not.toHaveBeenCalled();
  });

  it("does not report success until persisted prices are readable", async () => {
    const fake = provider();
    fake.client.prices.create.mockResolvedValue({ id: "unreadable" });
    const result = await runLiveCatalogSetup(apply, fake.options);
    expect(result).toMatchObject({ ok: false, ready: false });
    expect(result.plans).toHaveLength(catalogEntries().length);
  });

  it.each([
    [new Stripe.errors.StripeAuthenticationError({ message: "secret-looking-sensitive-detail" }), "stripe_authentication_failed"],
    [new Stripe.errors.StripePermissionError({ message: "secret-looking-sensitive-detail" }), "stripe_permission_denied"],
    [new Error("secret-looking-sensitive-detail"), "catalog_setup_failed"],
  ])("returns safe errors without credentials or provider text", async (error, code) => {
    const fake = provider();
    fake.client.prices.list.mockImplementation(() => { throw error; });
    const result = await runLiveCatalogSetup(apply, fake.options);
    expect(result).toEqual({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain("secret-looking");
    expect(fake.client.prices.create).not.toHaveBeenCalled();
  });
});
