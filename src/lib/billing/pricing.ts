import tiers from "@/config/pricing.json";
import discounts from "@/config/credit-bundles.json";

export type BillingInterval = "month" | "year";
export type PricingTier = (typeof tiers)[number];
export const pricingTiers = tiers;
export const creditBundleOptions = [1, 2, 3] as const;
export type CreditBundle = (typeof creditBundleOptions)[number];
export function isCreditBundle(value: unknown): value is CreditBundle {
  return typeof value === "number" && creditBundleOptions.some((option) => option === value);
}
export function creditBundleFromQuery(value: string | undefined): CreditBundle {
  const quantity = Number(value);
  return isCreditBundle(quantity) ? quantity : 1;
}

export function bundleDiscount(quantity: CreditBundle) { return discounts[quantity]; }

export function planTerms(tier: PricingTier, interval: BillingInterval, quantity: CreditBundle = 1) {
  if (!isCreditBundle(quantity)) throw new Error("Choose a supported credit bundle.");
  const annual = interval === "year";
  const discountPercent = bundleDiscount(quantity);
  const undiscountedAmount = (annual ? tier.annualMonthlyAmount * 12 : tier.monthlyAmount) * quantity;
  const amount = Math.round(undiscountedAmount * (100 - discountPercent) / 100);
  return {
    amount, discountPercent, undiscountedAmount,
    bundleSavings: undiscountedAmount - amount,
    monthlyEquivalent: amount / (annual ? 12 : 1),
    credits: tier.monthlyCredits * (annual ? 12 : 1) * quantity,
    monthlyCredits: tier.monthlyCredits * quantity,
    lookupKey: quantity === 1 ? `framefoundry_${tier.id}_${interval}_v1` : `framefoundry_${tier.id}_${interval}_bundle${quantity}_v1`,
    annualSavings: Math.round(tier.monthlyAmount * quantity * (100 - discountPercent) / 100) * 12 - Math.round(tier.annualMonthlyAmount * 12 * quantity * (100 - discountPercent) / 100),
  };
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function pricingAccountHref(tierId: string, interval: BillingInterval, quantity: CreditBundle = 1) {
  return `/studio/profile?tab=billing&plan=${encodeURIComponent(tierId)}&interval=${interval}${quantity === 1 ? "" : `&quantity=${quantity}`}`;
}
