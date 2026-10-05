import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), price: vi.fn(), create: vi.fn(), subscriptions: vi.fn(), sessions: vi.fn(), expire: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: unknown) => error instanceof Error ? error.message : "Failed" }));
vi.mock("@/lib/billing/stripe", () => ({ accountReturnUrl: () => "https://studio.test/studio/profile", getBillingCustomer: async () => "cus_owned", getStripe: () => ({ prices: { retrieve: mocks.price }, subscriptions: { list: mocks.subscriptions }, checkout: { sessions: { create: mocks.create, list: mocks.sessions, expire: mocks.expire } } }) }));
import { createCheckout } from "@/app/studio/profile/actions";
import { creatorOffer } from "@/lib/billing/creator-offer";
import { toBillingPlan, toOfferedBillingPlan } from "@/lib/billing/catalog";
import { offerPrice } from "./fixtures/creator-offer";

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { update: () => chain, eq: () => chain, or: () => chain, select: () => chain, maybeSingle: async () => ({ data: { user_id: "owner" }, error: null }) };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, workspaceId: "workspace_owned", admin: { from: () => chain } });
  mocks.price.mockResolvedValue({ ...offerPrice(), unit_amount: 900, lookup_key: "framefoundry_creator_month_v2", metadata: { credits: "200" } });
  mocks.subscriptions.mockResolvedValue({ data: [] }); mocks.sessions.mockResolvedValue({ data: [] }); mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/new" });
});
afterEach(() => vi.restoreAllMocks());

describe("new pricing and legacy campaign isolation", () => {
  it.each([creatorOffer.id, "invented-offer"])("rejects stale offer %s before contacting Stripe", async (offerId) => {
    expect((await createCheckout("price_creator", 1, offerId)).error).toContain("ended");
    expect(mocks.price).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses regular $9 recurring terms with no trial or surprise introductory charge", async () => {
    expect((await createCheckout("price_creator")).url).toContain("stripe.com");
    const fields = mocks.create.mock.calls[0][0];
    expect(fields.line_items).toEqual([{ price: "price_creator", quantity: 1 }]);
    expect(fields.metadata.offer_id).toBeUndefined();
    expect(fields.subscription_data.trial_end).toBeUndefined();
  });
  it("rejects a legacy price for new checkout but preserves legacy invoice compatibility", async () => {
    mocks.price.mockResolvedValue(offerPrice());
    expect(toBillingPlan(offerPrice())).not.toBeNull();
    expect(toOfferedBillingPlan(offerPrice())).toBeNull();
    expect((await createCheckout("price_creator")).error).toContain("not available");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("expires a stale campaign session instead of reusing it", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_old", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_creator", credit_bundle: "1", offer_id: creatorOffer.id }, url: "https://checkout.stripe.com/old" }] });
    await createCheckout("price_creator");
    expect(mocks.expire).toHaveBeenCalledWith("cs_old");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("keeps regular checkout available to a former subscriber", async () => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "canceled" }] });
    expect((await createCheckout("price_creator")).url).toContain("stripe.com");
  });
  it.each(["active", "trialing", "past_due"])("does not replace an existing %s subscription", async (status) => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status }] });
    expect((await createCheckout("price_creator")).error).toContain("already have");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
