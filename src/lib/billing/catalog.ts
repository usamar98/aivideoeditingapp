import type Stripe from "stripe";
import { planTerms, pricingTiers, type BillingInterval } from "./pricing";

export type BillingPlan = { id: string; name: string; description: string; amount: number; currency: string; interval: string; intervalCount: number; credits: number };
export type OfferedBillingPlan = BillingPlan & { tierId: string; interval: BillingInterval };

export function toBillingPlan(price: Stripe.Price): BillingPlan | null {
  const product = price.product;
  if (typeof product === "string" || product.deleted || !product.active || product.metadata.app !== "framefoundry") return null;
  const credits = Number(price.metadata.credits);
  if (!price.active || !price.recurring || price.recurring.usage_type !== "licensed" || price.billing_scheme !== "per_unit" || price.unit_amount === null || price.unit_amount <= 0 || !Number.isSafeInteger(credits) || credits < 1 || credits > 100000) return null;
  return { id: price.id, name: product.name, description: product.description || "", amount: price.unit_amount, currency: price.currency, interval: price.recurring.interval, intervalCount: price.recurring.interval_count, credits };
}

// Keep legacy invoice fulfillment independent from the current public catalog.
// New checkouts must match the exact advertised amount, interval, and allocation.
export function toOfferedBillingPlan(price: Stripe.Price): OfferedBillingPlan | null {
  const plan = toBillingPlan(price);
  if (!plan || plan.currency !== "usd" || plan.intervalCount !== 1 || price.transform_quantity) return null;
  if (plan.interval !== "month" && plan.interval !== "year") return null;
  for (const tier of pricingTiers) {
    const terms = planTerms(tier, plan.interval);
    if (price.lookup_key === terms.lookupKey && plan.amount === terms.amount && plan.credits === terms.credits) {
      return { ...plan, name: tier.name, description: tier.description, tierId: tier.id, interval: plan.interval };
    }
  }
  return null;
}

export const managedSubscriptionStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
export function isCreditInvoice(reason: string | null, paid: boolean, amountPaid: number) {
  return paid && amountPaid > 0 && (reason === "subscription_create" || reason === "subscription_cycle");
}
