import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), price: vi.fn(), create: vi.fn(), subscriptions: vi.fn(), sessions: vi.fn(), expire: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: unknown) => error instanceof Error ? error.message : "Failed" }));
vi.mock("@/lib/billing/stripe", () => ({ accountReturnUrl: () => "https://studio.test/studio/profile", getBillingCustomer: async () => "cus_owned", getStripe: () => ({ prices: { retrieve: mocks.price }, subscriptions: { list: mocks.subscriptions }, checkout: { sessions: { create: mocks.create, list: mocks.sessions, expire: mocks.expire } } }) }));
import { createCheckout } from "@/app/studio/profile/actions";
import { creatorOffer } from "@/lib/billing/creator-offer";
import { offerNow, offerPrice } from "./fixtures/creator-offer";
import { GET } from "@/app/api/billing/creator-offer/route";

beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(offerNow);
  const chain = { update: () => chain, eq: () => chain, or: () => chain, select: () => chain, maybeSingle: async () => ({ data: { user_id: "owner" }, error: null }) };
  mocks.account.mockResolvedValue({ user: { id: "owner" }, workspaceId: "workspace_owned", admin: { from: () => chain } });
  mocks.price.mockResolvedValue(offerPrice()); mocks.subscriptions.mockResolvedValue({ data: [] }); mocks.sessions.mockResolvedValue({ data: [] }); mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/offer" });
});
afterEach(() => vi.restoreAllMocks());

describe("Creator offer checkout", () => {
  it("uses server-owned offer terms for an authenticated first-time subscriber", async () => {
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).url).toContain("stripe.com");
    const fields = mocks.create.mock.calls[0][0];
    expect(fields.metadata.offer_id).toBe(creatorOffer.id);
    expect(fields.line_items).toHaveLength(2);
    expect(fields.subscription_data.metadata.workspace_id).toBe("workspace_owned");
    expect(fields.line_items[1].price_data.unit_amount).toBe(4999);
  });
  it("still gives eligible new subscribers the offer if their browser's clock request failed", async () => {
    await createCheckout("price_creator"); expect(mocks.create.mock.calls[0][0].metadata.offer_id).toBe(creatorOffer.id);
  });
  it("rejects stale offer clicks after expiry instead of silently charging regular terms", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse(creatorOffer.endsAt));
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).error).toContain("ended"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechecks the deadline after Stripe lookups, before creating a session", async () => {
    mocks.subscriptions.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(Date.parse(creatorOffer.endsAt)); return { data: [] }; });
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).error).toContain("ended"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("resumes regular checkout after expiry when the offer is not requested", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse(creatorOffer.endsAt)); await createCheckout("price_creator");
    expect(mocks.create.mock.calls[0][0].line_items).toEqual([{ price: "price_creator", quantity: 1 }]);
    expect(mocks.create.mock.calls[0][0].subscription_data.trial_end).toBeUndefined();
  });
  it.each(["active", "trialing", "canceled", "incomplete_expired"])("never awards the campaign again to a %s subscriber", async (status) => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status }] });
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).error).toBeTruthy(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps regular checkout available to a former subscriber", async () => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "canceled" }] }); await createCheckout("price_creator");
    expect(mocks.create.mock.calls[0][0].subscription_data.trial_end).toBeUndefined();
  });
  it("expires a regular open checkout before creating one with the offer", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_old", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_creator", credit_bundle: "1" }, url: "https://checkout.stripe.com/old" }] });
    await createCheckout("price_creator", 1, creatorOffer.id); expect(mocks.expire).toHaveBeenCalledWith("cs_old"); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("reuses an identical offer session for repeated clicks", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_offer", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_creator", credit_bundle: "1", offer_id: creatorOffer.id }, url: "https://checkout.stripe.com/saved" }] });
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).url).toContain("saved"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("replaces an expired campaign session before opening standard checkout", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse(creatorOffer.endsAt));
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_offer", mode: "subscription", metadata: { app: "framefoundry", price_id: "price_creator", credit_bundle: "1", offer_id: creatorOffer.id }, url: "https://checkout.stripe.com/saved" }] });
    await createCheckout("price_creator"); expect(mocks.expire).toHaveBeenCalledWith("cs_offer"); expect(mocks.create.mock.calls[0][0].metadata.offer_id).toBeUndefined();
  });
  it("does not accept an annual plan for the offer", async () => {
    mocks.price.mockResolvedValue(offerPrice({ lookup_key: "framefoundry_creator_year_v1", unit_amount: 35988, metadata: { credits: "13200" }, recurring: { ...offerPrice().recurring!, interval: "year" } }));
    expect((await createCheckout("price_creator", 1, creatorOffer.id)).error).toContain("monthly base"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects invented campaigns before contacting Stripe", async () => {
    expect((await createCheckout("price_creator", 1, "fake")).error).toContain("not available"); expect(mocks.price).not.toHaveBeenCalled();
  });
  it("does not trust client eligibility without authentication", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in")); expect((await createCheckout("price_creator", 1, creatorOffer.id)).error).toContain("sign in"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses an uncached server clock for the shared countdown", async () => {
    const response = GET(); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ now: offerNow, active: true, endsAt: creatorOffer.endsAt });
    vi.mocked(Date.now).mockReturnValue(Date.parse(creatorOffer.endsAt)); expect((await GET().json()).active).toBe(false);
  });
});
