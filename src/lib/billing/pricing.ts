import tiers from "@/config/pricing.json";

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

export function planTerms(tier: PricingTier, interval: BillingInterval, quantity: CreditBundle = 1) {
  if (!isCreditBundle(quantity)) throw new Error("Choose a supported credit bundle.");
  const annual = interval === "year";
  return {
    amount: (annual ? tier.annualMonthlyAmount * 12 : tier.monthlyAmount) * quantity,
    monthlyEquivalent: (annual ? tier.annualMonthlyAmount : tier.monthlyAmount) * quantity,
    credits: tier.monthlyCredits * (annual ? 12 : 1) * quantity,
    monthlyCredits: tier.monthlyCredits * quantity,
    lookupKey: `framefoundry_${tier.id}_${interval}_v1`,
    annualSavings: (tier.monthlyAmount - tier.annualMonthlyAmount) * 12 * quantity,
  };
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function pricingAccountHref(tierId: string, interval: BillingInterval, quantity: CreditBundle = 1) {
  return `/studio/profile?tab=billing&plan=${encodeURIComponent(tierId)}&interval=${interval}${quantity === 1 ? "" : `&quantity=${quantity}`}`;
}
