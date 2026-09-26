import type Stripe from "stripe";
import { creatorOffer, creatorOfferRenewal, isCreatorOfferActive } from "./creator-offer";

// Returns null for ordinary invoices. Offer renewals use normal recurring-credit
// fulfillment; only the initial paid invoice gets this fixed allocation.
export function creatorOfferInvoiceCredits(invoice: Stripe.Invoice, lines: Stripe.InvoiceLineItem[], prices: Map<string, Stripe.Price>, workspaceId: string): number | null {
  const metadata = invoice.parent?.subscription_details?.metadata;
  if (metadata?.offer_id !== creatorOffer.id || invoice.billing_reason !== "subscription_create") return null;
  const invalid = () => { throw new Error("Creator offer invoice does not match its fixed terms; manual review required."); };
  const started = Number(metadata.offer_started_at) * 1000;
  if (metadata.app !== "framefoundry" || metadata.workspace_id !== workspaceId || !isCreatorOfferActive(started) || Number(metadata.offer_renewal_at) !== creatorOfferRenewal(started) || invoice.currency !== "usd" || invoice.status !== "paid" || invoice.amount_paid <= 0 || invoice.subtotal !== creatorOffer.amount || !invoice.parent?.subscription_details?.subscription) return invalid();
  const recurring = prices.get(metadata.offer_price_id);
  if (!recurring || recurring.lookup_key !== "framefoundry_creator_month_v1" || recurring.unit_amount !== creatorOffer.amount || recurring.currency !== "usd" || recurring.recurring?.interval !== "month" || recurring.recurring.interval_count !== 1 || recurring.recurring.usage_type !== "licensed" || recurring.billing_scheme !== "per_unit" || recurring.transform_quantity || recurring.metadata.credits !== String(creatorOffer.credits)) return invalid();
  let paidItems = 0;
  let recurringItems = 0;
  for (const line of lines) {
    const ref = line.pricing?.price_details?.price;
    const price = prices.get(typeof ref === "string" ? ref : ref?.id || "");
    const product = price?.product;
    if (!price || !product || typeof product === "string" || product.deleted || product.id !== metadata.offer_product_id || product.metadata.app !== "framefoundry" || line.quantity !== 1 || line.currency !== "usd" || line.parent?.subscription_item_details?.proration || line.parent?.invoice_item_details?.proration) return invalid();
    if (price.id === recurring.id && line.amount === 0) { recurringItems++; continue; }
    if (price.type !== "one_time" || price.recurring || price.currency !== "usd" || price.unit_amount !== creatorOffer.amount || price.billing_scheme !== "per_unit" || price.transform_quantity || line.amount !== creatorOffer.amount || line.discount_amounts?.some((discount) => discount.amount > 0)) return invalid();
    paidItems++;
  }
  if (paidItems !== 1 || recurringItems !== 1) return invalid();
  return creatorOffer.credits;
}
