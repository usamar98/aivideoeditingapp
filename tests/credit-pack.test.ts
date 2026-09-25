import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { creditPackEventKey, isPaidCreditPackSession, validCreditPackSession } from "@/lib/billing/credit-pack";
import { packOwner, packSession } from "./fixtures/credit-pack";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ account: vi.fn(), customer: vi.fn(), create: vi.fn(), list: vi.fn(), retrieve: vi.fn(), update: vi.fn(), lease: vi.fn(), enabled: true }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: unknown) => error instanceof Error ? error.message : "Failed" }));
vi.mock("@/lib/billing/stripe", () => ({ accountReturnUrl: () => "https://studio.test/studio/profile", getBillingCustomer: mocks.customer, getStripe: () => ({ checkout: { sessions: { create: mocks.create, list: mocks.list, retrieve: mocks.retrieve } } }) }));
vi.mock("@/lib/billing/credit-pack", async (original) => {
  const real = await original<typeof import("@/lib/billing/credit-pack")>();
  return { ...real, creditPack: { ...real.creditPack, get enabled() { return mocks.enabled; } } };
});
import { createCreditPackCheckout } from "@/app/studio/profile/credit-pack-actions";
import { getCreditPackReceipt } from "@/lib/billing/credit-pack-receipt";

beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true;
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_local_test_only");
  const chain = { eq: () => chain, or: () => chain, select: () => chain, maybeSingle: mocks.lease };
  mocks.update.mockReturnValue(chain); mocks.lease.mockResolvedValue({ data: { user_id: packOwner.userId }, error: null });
  mocks.account.mockResolvedValue({ user: { id: packOwner.userId }, workspaceId: packOwner.workspaceId, admin: { from: () => ({ update: mocks.update }) } });
  mocks.customer.mockResolvedValue(packOwner.customerId); mocks.list.mockResolvedValue({ data: [] });
  mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/pack" });
  mocks.retrieve.mockResolvedValue(packSession());
});
afterEach(() => vi.unstubAllEnvs());

describe("temporary one-time credit pack", () => {
  it("charges exactly USD 1 for 10 credits without a subscription or price ID", async () => {
    expect(await createCreditPackCheckout()).toEqual({ url: "https://checkout.stripe.com/pack" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ customer: packOwner.customerId, mode: "payment", client_reference_id: packOwner.userId,
      line_items: [{ quantity: 1, price_data: expect.objectContaining({ unit_amount: 100, currency: "usd" }) }],
      metadata: expect.objectContaining({ credits: "10", workspace_id: packOwner.workspaceId }), allow_promotion_codes: false, adaptive_pricing: { enabled: false },
    }), { idempotencyKey: expect.stringContaining(`credit-pack:${packOwner.userId}:`) });
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("subscription_data");
    expect(mocks.update).toHaveBeenLastCalledWith({ checkout_lock_token: null, checkout_lock_until: null });
  });
  it("requires a real authenticated account", async () => {
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    expect((await createCreditPackCheckout()).error).toBe("Please sign in");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("disables new checkouts while keeping historical fulfillment terms", async () => {
    mocks.enabled = false;
    expect((await createCreditPackCheckout()).error).toContain("no longer available");
    expect(mocks.account).not.toHaveBeenCalled();
    expect(validCreditPackSession(packSession(), packOwner)).toBe(true);
  });
  it("requires webhook setup before taking money", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await createCreditPackCheckout()).error).toContain("confirmation is not configured");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a concurrent checkout lease", async () => {
    mocks.lease.mockResolvedValue({ data: null, error: null });
    expect((await createCreditPackCheckout()).error).toContain("Another checkout");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses an open verified pack checkout", async () => {
    const session = packSession({ status: "open", payment_status: "unpaid" });
    mocks.list.mockResolvedValue({ data: [session] }); mocks.retrieve.mockResolvedValue(session);
    expect(await createCreditPackCheckout()).toEqual({ url: session.url });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not reuse or change a pending subscription checkout", async () => {
    mocks.list.mockResolvedValue({ data: [packSession({ mode: "subscription" })] });
    expect((await createCreditPackCheckout()).url).toBeTruthy();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("retains the lease after an uncertain network response", async () => {
    mocks.create.mockRejectedValue(new Error("Network interrupted"));
    expect((await createCreditPackCheckout()).error).toContain("Network interrupted");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});

describe("credit pack fixed terms", () => {
  it("validates immutable terms and uses one key per Checkout Session", () => {
    expect(validCreditPackSession(packSession(), packOwner)).toBe(true);
    expect(isPaidCreditPackSession(packSession())).toBe(true);
    expect(creditPackEventKey("cs_test_pack")).toBe("stripe:checkout:cs_test_pack");
  });
  it.each([{ amount_total: 99 }, { currency: "eur" }, { mode: "subscription" }, { customer: "cus_other" }, { client_reference_id: "other" }, { metadata: { credits: "1000" } }, { line_items: { has_more: true, data: [] } }])("rejects mismatched checkout terms %j", (override) => {
    expect(validCreditPackSession(packSession(override as Partial<Stripe.Checkout.Session>), packOwner)).toBe(false);
  });
  it.each([{ payment_status: "unpaid" }, { status: "expired" }, { payment_intent: "pi_not_expanded" }, { payment_intent: { status: "processing", amount_received: 100, currency: "usd" } }, { payment_intent: { status: "succeeded", amount_received: 0, currency: "usd" } }])("does not treat pending or unpaid checkout as paid %j", (override) => {
    expect(isPaidCreditPackSession(packSession(override as Partial<Stripe.Checkout.Session>))).toBe(false);
  });
});

describe("read-only payment return verification", () => {
  function ledger(amount: number | null) {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: amount === null ? null : { amount }, error: null }) };
    return { from: vi.fn(() => query) } as unknown as Parameters<typeof getCreditPackReceipt>[2];
  }
  it("shows confirmed credits only for an owned paid session and matching ledger entry", async () => {
    mocks.retrieve.mockResolvedValue(packSession({ livemode: true }));
    expect(await getCreditPackReceipt("cs_test_creditpack123", packOwner, ledger(10))).toContain("10 credits were added");
  });
  it("does not claim credit delivery when the webhook is pending", async () => {
    expect(await getCreditPackReceipt("cs_test_creditpack123", packOwner, ledger(null))).toContain("awaiting webhook confirmation");
  });
  it("labels test-mode payments and rejects another account's receipt", async () => {
    expect(await getCreditPackReceipt("cs_test_creditpack123", packOwner, ledger(10))).toContain("no real money");
    expect(await getCreditPackReceipt("cs_test_creditpack123", { ...packOwner, userId: "other" }, ledger(10))).toContain("could not be verified");
  });
  it("does not trust a fabricated success URL", async () => {
    expect(await getCreditPackReceipt("fake", packOwner, ledger(10))).toContain("could not be verified");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});
