import type Stripe from "stripe";
import { creditPack } from "@/lib/billing/credit-pack";

export const packOwner = { userId: "user_owned", workspaceId: "workspace_owned", customerId: "cus_owned" };
export function packSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_test_creditpack123", mode: "payment", customer: packOwner.customerId,
    client_reference_id: packOwner.userId, currency: "usd", amount_subtotal: 100, amount_total: 100,
    metadata: { app: "framefoundry", purchase_kind: "credit_pack", credit_pack_id: creditPack.id, credits: "10", user_id: packOwner.userId, workspace_id: packOwner.workspaceId },
    line_items: { has_more: false, data: [{ quantity: 1, currency: "usd", amount_subtotal: 100, amount_total: 100, price: { unit_amount: 100, currency: "usd", recurring: null } }] },
    status: "complete", payment_status: "paid", livemode: false,
    payment_intent: { id: "pi_pack", status: "succeeded", amount_received: 100, currency: "usd" },
    url: "https://checkout.stripe.com/pack", ...overrides,
  } as Stripe.Checkout.Session;
}
