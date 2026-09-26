import type Stripe from "stripe";
import { creatorOffer, creatorOfferCheckout } from "@/lib/billing/creator-offer";

export const offerNow = Date.parse(creatorOffer.startsAt) + 60_000;
export function offerPrice(overrides: Partial<Stripe.Price> = {}) {
  return { id: "price_creator", type: "recurring", active: true, currency: "usd", unit_amount: 4999, billing_scheme: "per_unit", lookup_key: "framefoundry_creator_month_v1", metadata: { credits: "1100" }, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, product: { id: "prod_creator", active: true, name: "Creator", metadata: { app: "framefoundry" } }, ...overrides } as Stripe.Price;
}
export function offerPrices() {
  return new Map([["price_creator", offerPrice()], ["price_intro", offerPrice({ id: "price_intro", type: "one_time", recurring: null, lookup_key: null, metadata: {} })]]);
}
export function offerLines() {
  return [
    { id: "il_recurring", amount: 0, quantity: 1, currency: "usd", pricing: { price_details: { price: "price_creator" } }, parent: { subscription_item_details: { proration: false } } },
    { id: "il_intro", amount: 4999, quantity: 1, currency: "usd", pricing: { price_details: { price: "price_intro" } }, parent: { invoice_item_details: { proration: false } }, discount_amounts: [] },
  ] as unknown as Stripe.InvoiceLineItem[];
}
export function offerInvoice(overrides: Partial<Stripe.Invoice> = {}) {
  const metadata = creatorOfferCheckout("price_creator", "prod_creator", "workspace_owned", offerNow).subscription_data!.metadata;
  return { id: "in_offer", customer: "cus_owned", billing_reason: "subscription_create", status: "paid", amount_paid: 4999, subtotal: 4999, currency: "usd", parent: { type: "subscription_details", subscription_details: { subscription: "sub_offer", metadata } }, ...overrides } as Stripe.Invoice;
}
