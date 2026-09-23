import tiers from "@/config/pricing.json";

export type BillingInterval = "month" | "year";
export type PricingTier = (typeof tiers)[number];
export const pricingTiers = tiers;

export function planTerms(tier: PricingTier, interval: BillingInterval) {
  const annual = interval === "year";
  return {
    amount: annual ? tier.annualMonthlyAmount * 12 : tier.monthlyAmount,
    monthlyEquivalent: annual ? tier.annualMonthlyAmount : tier.monthlyAmount,
    credits: tier.monthlyCredits * (annual ? 12 : 1),
    lookupKey: `framefoundry_${tier.id}_${interval}_v1`,
    annualSavings: (tier.monthlyAmount - tier.annualMonthlyAmount) * 12,
  };
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function pricingAccountHref(tierId: string, interval: BillingInterval) {
  return `/studio/profile?tab=billing&plan=${encodeURIComponent(tierId)}&interval=${interval}`;
}
