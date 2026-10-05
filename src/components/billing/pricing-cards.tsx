"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { creditBundleOptions, isCreditBundle, formatUsd, planTerms, pricingAccountHref, pricingTiers, type BillingInterval, type CreditBundle } from "@/lib/billing/pricing";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";
import { CreditSelector } from "./credit-selector";

type PricingCardsProps = {
  initialInterval?: BillingInterval;
  selectedTier?: string;
  initialQuantity?: CreditBundle;
} & ({
  mode?: "marketing";
} | {
  mode: "billing";
  plans: OfferedBillingPlan[];
  pending: boolean;
  demo: boolean;
  hasSubscription: boolean;
  offerEligible?: boolean;
  onChoose: (priceId: string, quantity: CreditBundle, offerId?: string) => void;
});

const includedFeatures = [
  "Faceless videos & AI cartoons",
  "AI UGC & product ads",
  "Editable scripts, scenes & hooks",
  "Private video downloads & captions",
  "One credit balance across creative tools",
  "Generation cost shown before you confirm",
];
const enterpriseFeatures = [
  "The same ETA creative workflows",
  "Discuss a custom credit allowance",
  "Plan for your generation volume",
  "Agree pricing and billing with our team",
];
const displayPrice = (cents: number) => formatUsd(cents).replace(/\.00$/, "");

export function PricingCards(props: PricingCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>(props.initialInterval ?? "month");
  const [quantities, setQuantities] = useState<Record<string, CreditBundle>>(() => Object.fromEntries(pricingTiers.map((tier) => [tier.id, tier.id === props.selectedTier ? props.initialQuantity ?? 1 : 1])));
  const id = useId();
  const annual = interval === "year";

  return <div className="@container">
    <fieldset className="mb-9 flex flex-wrap items-center justify-center gap-3">
      <legend className="sr-only">Billing frequency</legend>
      <div className="inline-flex rounded-full border border-primary/15 bg-accent/60 p-1">
        {(["month", "year"] as const).map((value) => <label key={value} className="cursor-pointer">
          <input type="radio" name={`${id}-frequency`} value={value} checked={interval === value} disabled={props.mode === "billing" && props.pending} onChange={() => setInterval(value)} className="peer sr-only" />
          <span className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50">{value === "month" ? "Monthly" : "Yearly"}</span>
        </label>)}
      </div>
      <span className="text-xs font-medium text-primary">Save 20% with yearly billing</span>
    </fieldset>

    <p className="sr-only" aria-live="polite">{annual ? "Yearly billing selected. Pay once per year and receive all twelve months of credits upfront." : "Monthly billing selected. Pay and receive credits each paid month."}</p>
    <div className="grid items-start gap-5 @4xl:grid-cols-3">
      {pricingTiers.map((tier) => {
        const quantity = quantities[tier.id] ?? 1;
        const terms = planTerms(tier, interval, quantity);
        const featured = tier.id === "growth";
        const selected = props.selectedTier === tier.id;
        const price = props.mode === "billing" ? props.plans.find((plan) => plan.tierId === tier.id && plan.interval === interval && plan.creditBundle === quantity && plan.amount === terms.amount && plan.credits === terms.credits && plan.currency === "usd" && plan.intervalCount === 1) : undefined;
        const disabled = props.mode === "billing" && (props.pending || props.demo || props.hasSubscription || !price);

        return <article key={tier.id} data-pricing-tier={tier.id} aria-labelledby={`${id}-${tier.id}-heading`} className={cn("min-w-0 overflow-hidden rounded-[20px] border bg-card text-card-foreground", featured ? "border-primary shadow-[0_12px_48px_-24px_var(--primary)]" : "border-border @4xl:mt-9", selected && "ring-2 ring-primary ring-offset-4 ring-offset-background")}>
          {featured && <div className="flex h-9 items-center justify-center bg-linear-to-r from-primary to-[#5787ed] text-sm font-bold tracking-wide text-primary-foreground">MOST POPULAR</div>}
          <div className={cn("px-6 pb-7 pt-6 sm:px-7", featured && "bg-linear-to-b from-accent/35 to-card")}>
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
              <h3 id={`${id}-${tier.id}-heading`} className="text-2xl font-semibold tracking-tight">{tier.name}</h3>
              {selected && <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-primary">Your selection</span>}
            </div>
            <div aria-live="polite" aria-atomic="true" className="mt-3 min-h-[96px]">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-[38px] leading-tight font-semibold tracking-tight tabular-nums">{displayPrice(terms.monthlyEquivalent)}</span><span className="text-xs text-muted-foreground">/ month{annual ? " equivalent" : ""}</span></p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{annual ? `${formatUsd(terms.amount)} billed yearly` : "Monthly subscription. No introductory price increase."}</p>
              {terms.discountPercent > 0 && <p className="mt-1 text-xs leading-5 text-primary"><s className="mr-1.5 text-muted-foreground">{displayPrice(terms.undiscountedAmount / (annual ? 12 : 1))}/mo</s>{terms.discountPercent}% bundle discount</p>}
            </div>

            <CreditSelector name={tier.name} options={creditBundleOptions.map((bundle) => ({ value: bundle, credits: tier.monthlyCredits * bundle }))} value={quantity} disabled={props.mode === "billing" && props.pending} onChange={(next) => { if (isCreditBundle(next)) setQuantities((current) => ({ ...current, [tier.id]: next })); }} />
            <div aria-live="polite" aria-atomic="true" className="mt-4 min-h-[92px]">
              <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums"><Gem aria-hidden="true" className="size-4 text-primary" />{terms.credits.toLocaleString("en-US")}<span className="text-xs font-normal text-muted-foreground">credits / {annual ? "year" : "month"}</span></p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{annual ? `All ${terms.credits.toLocaleString("en-US")} credits upfront each paid year — equivalent to ${terms.monthlyCredits.toLocaleString("en-US")} per month, not a monthly refill.` : tier.description}</p>
            </div>

            {props.mode === "billing" ? <>
              <Button data-pricing-checkout className="h-10 w-full rounded-full text-[13px] font-medium" variant={featured ? "default" : "secondary"} disabled={disabled} onClick={() => { if (price) props.onChoose(price.id, quantity); }}>
                {props.pending ? "Please wait…" : props.demo ? "Demo preview" : props.hasSubscription ? "Use Manage subscription" : !price ? "Not available yet" : "Get Started"}
              </Button>
              {!props.demo && !props.hasSubscription && !price && <p className="mt-2 text-xs leading-5 text-muted-foreground">This plan is not connected to Stripe yet.</p>}
            </> : <Button asChild className="h-10 w-full rounded-full text-[13px] font-medium" variant={featured ? "default" : "secondary"}><Link aria-label={`Get started with ${tier.name}`} href={pricingAccountHref(tier.id, interval, quantity)}>Get Started</Link></Button>}

            <p className="mt-5 text-xs leading-5 text-muted-foreground">Billed {annual ? "annually" : "monthly"}. Cancel future renewals anytime.</p>
            <div className="mt-7">
              <h4 className="text-xs font-semibold">Plan Includes:</h4>
              <ul className="mt-3 space-y-2.5 text-[13px] leading-5 text-muted-foreground">
                {includedFeatures.map((feature) => <li key={feature} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-foreground" /><span>{feature}</span></li>)}
              </ul>
            </div>
          </div>
        </article>;
      })}

      <article data-pricing-tier="enterprise" aria-labelledby={`${id}-enterprise-heading`} className="min-w-0 rounded-[20px] border border-border bg-card px-6 pb-7 pt-6 text-card-foreground sm:px-7 @4xl:mt-9">
        <h3 id={`${id}-enterprise-heading`} className="min-h-7 text-2xl font-semibold tracking-tight">Enterprise</h3>
        <div className="mt-3 min-h-[96px]"><p className="text-[38px] leading-tight font-semibold tracking-tight">Custom</p></div>
        <div className="flex h-[78px] items-end pb-2"><p className="flex items-center gap-1.5 text-lg font-semibold"><Gem aria-hidden="true" className="size-4 text-primary" />Custom credits</p></div>
        <p className="mt-4 min-h-[92px] text-xs leading-5 text-muted-foreground">A tailored credit budget for larger creative workloads. Tell us what you want to create.</p>
        <Button asChild variant="secondary" className="h-10 w-full rounded-full text-[13px] font-medium"><Link href="/contact">Let’s Talk</Link></Button>
        <p className="mt-5 text-xs leading-5 text-muted-foreground">Pricing and billing terms agreed with you.</p>
        <div className="mt-7">
          <h4 className="text-xs font-semibold">Your plan, built around your usage:</h4>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-5 text-muted-foreground">
            {enterpriseFeatures.map((feature) => <li key={feature} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-foreground" /><span>{feature}</span></li>)}
          </ul>
        </div>
      </article>
    </div>
    <p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-6 text-muted-foreground">All prices are in USD. All tools share your credit balance; each shows its generation cost before you confirm. Faceless rendering uses 20 credits; an AI-written script uses 2 more. Cartoon and UGC costs depend on the selected output. Podcast Shorts analysis uses 40 credits, with 10 more per exported clip. Regeneration costs additional credits. Credits are added only after confirmed payment. Applicable taxes, if any, are shown at checkout.</p>
  </div>;
}
