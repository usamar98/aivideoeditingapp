import type Stripe from "stripe";

// One shared campaign window. Refreshing, signing in or redeploying never resets it.
export const creatorOffer = {
  id: "creator-two-months-20260926",
  startsAt: "2026-09-26T14:11:03.000Z",
  endsAt: "2026-09-27T14:11:03.000Z",
  amount: 4999,
  credits: 1100,
  checkoutMinutes: 31,
} as const;

export function isCreatorOfferActive(now: number) {
  return Number.isFinite(now) && now >= Date.parse(creatorOffer.startsAt) && now < Date.parse(creatorOffer.endsAt);
}

export function isCreatorOfferPlan(plan: { tierId: string; interval: string; creditBundle: number } | null | undefined) {
  return plan?.tierId === "creator" && plan.interval === "month" && plan.creditBundle === 1;
}

export function creatorOfferRenewal(now: number) {
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 2);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

export function formatOfferCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function creatorOfferCheckout(priceId: string, productId: string, workspaceId: string, now: number): Pick<Stripe.Checkout.SessionCreateParams, "line_items" | "subscription_data" | "expires_at" | "custom_text" | "payment_method_collection" | "payment_method_types"> {
  if (!isCreatorOfferActive(now)) throw new Error("This offer has ended. Refresh billing to review the current plan before continuing.");
  const renewal = creatorOfferRenewal(now);
  return {
    // The one-time item is charged now. Stripe defers the recurring item until
    // the promotional period ends; no follow-up worker or coupon is required.
    line_items: [
      { price: priceId, quantity: 1 },
      { price_data: { currency: "usd", unit_amount: creatorOffer.amount, product: productId }, quantity: 1 },
    ],
    subscription_data: {
      trial_end: renewal,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { app: "framefoundry", workspace_id: workspaceId, offer_id: creatorOffer.id, offer_price_id: priceId, offer_product_id: productId, offer_started_at: String(Math.floor(now / 1000)), offer_renewal_at: String(renewal) },
    },
    // Stripe requires at least 30 minutes; one extra minute covers request latency.
    expires_at: Math.floor(now / 1000) + creatorOffer.checkoutMinutes * 60,
    payment_method_collection: "always",
    payment_method_types: ["card"],
    custom_text: { submit: { message: "$49.99 today for two months of Creator access with 1,100 credits included for that period. Then $49.99/month with 1,100 credits per paid month. Cancel future renewals anytime in your account. The recurring item is shown as a trial until your renewal date; the one-time item is today's payment." } },
  };
}
