import type Stripe from "stripe";

// Retired temporary offer: hide every card and reject new checkout requests.
// Keep the immutable terms below so delayed paid webhooks still settle.
export const creditPack = {
  enabled: false,
  id: "eta-10-credits-usd-1-v1",
  name: "Mini credit pack",
  amount: 100,
  currency: "usd",
  credits: 10,
} as const;

export const creditPackAccountHref = "/studio/profile?tab=billing#mini-credit-pack";
export const creditPackEventKey = (sessionId: string) => `stripe:checkout:${sessionId}`;

export function isCreditPackSession(session: Stripe.Checkout.Session) {
  return session.mode === "payment" && session.metadata?.app === "framefoundry" &&
    session.metadata.purchase_kind === "credit_pack" && session.metadata.credit_pack_id === creditPack.id;
}

export function validCreditPackSession(session: Stripe.Checkout.Session, owner: { userId: string; workspaceId: string; customerId: string }) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const lines = session.line_items;
  const line = lines?.data[0];
  return isCreditPackSession(session) && customerId === owner.customerId &&
    session.client_reference_id === owner.userId && session.metadata?.user_id === owner.userId &&
    session.metadata.workspace_id === owner.workspaceId && session.metadata.credits === String(creditPack.credits) &&
    session.currency === creditPack.currency && session.amount_subtotal === creditPack.amount && session.amount_total === creditPack.amount &&
    lines?.has_more === false && lines.data.length === 1 && line?.quantity === 1 &&
    line.currency === creditPack.currency && line.amount_subtotal === creditPack.amount && line.amount_total === creditPack.amount &&
    line.price?.unit_amount === creditPack.amount && line.price.currency === creditPack.currency && !line.price.recurring;
}

export function isPaidCreditPackSession(session: Stripe.Checkout.Session) {
  const payment = session.payment_intent;
  return session.status === "complete" && session.payment_status === "paid" &&
    typeof payment === "object" && payment !== null && payment.status === "succeeded" &&
    payment.amount_received === creditPack.amount && payment.currency === creditPack.currency;
}
