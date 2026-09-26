import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), price: vi.fn(), customer: vi.fn(), create: vi.fn(), subscriptions: vi.fn(), sessions: vi.fn(), expire: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: unknown) => error instanceof Error ? error.message : "Failed" }));
vi.mock("@/lib/billing/stripe", () => ({ accountReturnUrl: () => "https://studio.test/studio/profile", getBillingCustomer: mocks.customer, getStripe: () => ({ prices: { retrieve: mocks.price }, subscriptions: { list: mocks.subscriptions }, checkout: { sessions: { create: mocks.create, list: mocks.sessions, expire: mocks.expire } } }) }));
import { planTerms, pricingTiers, type CreditBundle } from "@/lib/billing/pricing";
import { createCheckout } from "@/app/studio/profile/actions";

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { update: () => chain, eq: () => chain, or: () => chain, select: () => chain, maybeSingle: async () => ({ data: { user_id: "owner" }, error: null }) };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, workspaceId: "owned_workspace", admin: { from: () => chain } });
  mocks.price.mockResolvedValue({ id: "price_annual", active: true, currency: "usd", unit_amount: 35988, lookup_key: "framefoundry_creator_year_v1", billing_scheme: "per_unit", metadata: { credits: "13200" }, recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }, product: { active: true, name: "Creator", metadata: { app: "framefoundry" } } });
  mocks.customer.mockResolvedValue("cus_owned");
  mocks.subscriptions.mockResolvedValue({ data: [] });
  mocks.sessions.mockResolvedValue({ data: [] });
  mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
});

async function useBundle(quantity: CreditBundle) {
  const terms = planTerms(pricingTiers[1], "year", quantity);
  mocks.price.mockResolvedValue({ ...await mocks.price(), unit_amount: terms.amount, metadata: { credits: String(terms.credits) }, lookup_key: terms.lookupKey });
}
describe("advertised plan checkout boundary", () => {
  it.each([2, 3])("checks out the discounted %i× price with quantity one", async (quantity) => {
    await useBundle(quantity as CreditBundle);
    await createCheckout("price_annual", quantity);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: "price_annual", quantity: 1 }], metadata: { app: "framefoundry", price_id: "price_annual", credit_bundle: String(quantity) } }), expect.any(Object));
  });
  it.each([0, -1, 1.5, 4, NaN, Infinity])("rejects unsupported quantity %s before any checkout work", async (quantity) => {
    expect((await createCheckout("price_annual", quantity)).error).toContain("supported credit bundle");
    expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.price).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses a pending session only when both its price and credit quantity match", async () => {
    await useBundle(2);
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_open", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_annual", credit_bundle: "2" }, url: "https://checkout.stripe.com/open" }] });
    expect((await createCheckout("price_annual", 2)).url).toBe("https://checkout.stripe.com/open");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.expire).not.toHaveBeenCalled();
  });
  it("replaces an old base-quantity session when selecting more credits", async () => {
    await useBundle(2);
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_open", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_annual" }, url: "https://checkout.stripe.com/open" }] });
    await createCheckout("price_annual", 2);
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: "price_annual", quantity: 1 }] }), expect.any(Object));
  });
  it("checks out the selected annual price for the authenticated customer's workspace", async () => {
    expect((await createCheckout("price_annual")).url).toContain("checkout.stripe.com");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_owned", mode: "subscription", line_items: [{ price: "price_annual", quantity: 1 }], subscription_data: { metadata: { app: "framefoundry", workspace_id: "owned_workspace" } } }), expect.any(Object));
  });
  it("rejects a base price disguised as a discounted bundle before creating a customer", async () => {
    expect((await createCheckout("price_annual", 2)).error).toContain("not available");
    expect(mocks.customer).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects an altered Stripe price before creating a customer or checkout", async () => {
    const price = await mocks.price();
    mocks.price.mockResolvedValue({ ...price, unit_amount: 2999 });
    expect((await createCheckout("price_annual")).error).toContain("not available");
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires authentication even when the price id is valid", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    expect((await createCheckout("price_annual")).error).toBe("Please sign in");
    expect(mocks.price).not.toHaveBeenCalled();
  });
  it("does not create a second subscription", async () => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "active" }] });
    expect((await createCheckout("price_annual")).error).toContain("already have a subscription");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses the selected price's pending session", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_open", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_annual" }, url: "https://checkout.stripe.com/open" }] });
    expect((await createCheckout("price_annual")).url).toBe("https://checkout.stripe.com/open");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("leaves a one-time pack checkout untouched when subscribing", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_pack", mode: "payment", metadata: { app: "framefoundry", purchase_kind: "credit_pack" }, url: "https://checkout.stripe.com/pack" }] });
    expect((await createCheckout("price_annual")).url).toContain("checkout.stripe.com");
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalled();
  });
});
