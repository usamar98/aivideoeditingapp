import { describe, expect, it, vi } from "vitest";
import { creditPack, isPaidCreditPackSession, validCreditPackSession } from "@/lib/billing/credit-pack";
import { CreditPackCard } from "@/components/billing/credit-pack-card";
import { packOwner, packSession } from "./fixtures/credit-pack";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ account: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/account", () => ({ requireAccount: mocks.account, publicError: (error: unknown) => error instanceof Error ? error.message : "Failed" }));
vi.mock("@/lib/billing/stripe", () => ({ getStripe: mocks.stripe, getBillingCustomer: vi.fn(), accountReturnUrl: vi.fn() }));
import { createCreditPackCheckout } from "@/app/studio/profile/credit-pack-actions";

describe("retired one-dollar offer", () => {
  it("is disabled in the real configuration and hides both card variants", () => {
    expect(creditPack.enabled).toBe(false);
    expect(CreditPackCard({ mode: "marketing" })).toBeNull();
    expect(CreditPackCard({ mode: "billing", pending: false, demo: false, ready: true, testMode: false, onBuy: vi.fn() })).toBeNull();
  });

  it("rejects direct checkout requests before accessing accounts or Stripe", async () => {
    expect(await createCreditPackCheckout()).toEqual({ error: "This temporary credit pack is no longer available." });
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("still validates already-paid purchases for delayed fulfillment", () => {
    expect(validCreditPackSession(packSession(), packOwner)).toBe(true);
    expect(isPaidCreditPackSession(packSession())).toBe(true);
    expect(creditPack.credits).toBe(10);
    expect(creditPack.amount).toBe(100);
  });
});
