"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, Check, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatUsd, planTerms, pricingAccountHref, pricingTiers, type BillingInterval } from "@/lib/billing/pricing";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";

type PricingCardsProps = {
  initialInterval?: BillingInterval;
  selectedTier?: string;
} & ({
  mode?: "marketing";
} | {
  mode: "billing";
  plans: OfferedBillingPlan[];
  pending: boolean;
  demo: boolean;
  hasSubscription: boolean;
  onChoose: (priceId: string) => void;
});

export function PricingCards(props: PricingCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>(props.initialInterval ?? "month");
  const id = useId();
  const annual = interval === "year";

  return <div className="@container">
    <fieldset className="mb-8 flex flex-wrap items-center justify-center gap-3">
      <legend className="sr-only">Billing frequency</legend>
      <div className="inline-flex rounded-full border border-primary/15 bg-accent/60 p-1">
        {(["month", "year"] as const).map((value) => <label key={value} className="cursor-pointer">
          <input type="radio" name={`${id}-frequency`} value={value} checked={interval === value} onChange={() => setInterval(value)} className="peer sr-only" />
          <span className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">{value === "month" ? "Monthly" : "Yearly"}</span>
        </label>)}
      </div>
      <span className="text-xs font-medium text-primary">Save with yearly billing</span>
    </fieldset>

    <p className="sr-only" aria-live="polite">{annual ? "Yearly billing selected. Pay once per year and receive all twelve months of credits upfront." : "Monthly billing selected. Pay and receive credits each month."}</p>
    <div className="grid gap-5 @4xl:grid-cols-3">
      {pricingTiers.map((tier) => {
        const terms = planTerms(tier, interval);
        const featured = tier.id === "creator";
        const selected = props.selectedTier === tier.id;
        const price = props.mode === "billing" ? props.plans.find((plan) => plan.tierId === tier.id && plan.interval === interval) : undefined;
        const disabled = props.mode === "billing" && (props.pending || props.demo || props.hasSubscription || !price);

        return <Card key={tier.id} className={cn("relative flex flex-col rounded-2xl p-6 sm:p-7", featured && "border-primary/50 bg-accent/30 shadow-sm", selected && "ring-2 ring-primary ring-offset-2")}>
          <div className="flex min-h-6 items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            {selected ? <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">Your selection</span> : featured && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Room to grow</span>}
          </div>
          <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">{tier.description}</p>
          <p className="mt-6 flex flex-wrap items-baseline gap-1.5"><span className="text-4xl font-semibold tracking-tight">{formatUsd(terms.monthlyEquivalent)}</span><span className="text-sm text-muted-foreground">/ month</span></p>
          <p className="mt-2 text-sm text-muted-foreground">{annual ? `${formatUsd(terms.amount)} billed yearly` : `${formatUsd(terms.amount)} billed monthly`}</p>
          <p className="mt-3 min-h-5 text-xs font-medium text-primary">{annual ? `Save ${formatUsd(terms.annualSavings)} per year vs. monthly` : "A monthly subscription. Cancel future renewals anytime."}</p>

          <div className="my-6 rounded-xl border border-primary/10 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-primary"><Coins className="size-4 shrink-0" /><span className="text-xl font-semibold">{terms.credits.toLocaleString("en-US")}</span><span className="text-sm">credits {annual ? "/ year" : "/ month"}</span></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{annual ? `All ${terms.credits.toLocaleString("en-US")} credits upfront each paid year — equivalent to ${tier.monthlyCredits.toLocaleString("en-US")} per month, not a monthly refill.` : `${tier.monthlyCredits.toLocaleString("en-US")} credits after each successful monthly payment.`}</p>
          </div>
          <ul className="mb-7 space-y-3 text-sm">
            {["Faceless videos & AI cartoons", "AI UGC & product ads", "Editable scripts, scenes & hooks", "Private video downloads & captions"].map((feature) => <li key={feature} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span>{feature}</span></li>)}
          </ul>
          <div className="mt-auto">
            {props.mode === "billing" ? <>
              <Button className="w-full" variant={featured ? "default" : "outline"} disabled={disabled} onClick={() => { if (price) props.onChoose(price.id); }}>
                {props.pending ? "Please wait…" : props.demo ? "Demo preview" : props.hasSubscription ? "Use Manage subscription" : !price ? "Not available yet" : `Choose ${tier.name}`}
              </Button>
              {!props.demo && !props.hasSubscription && !price && <p className="mt-2 text-xs leading-5 text-muted-foreground">This plan is not connected to Stripe yet.</p>}
            </> : <Button asChild className="w-full" variant={featured ? "default" : "outline"}><Link href={pricingAccountHref(tier.id, interval)}>Choose {tier.name}<ArrowRight /></Link></Button>}
          </div>
        </Card>;
      })}
    </div>
    <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-6 text-muted-foreground">All prices are in USD. All three tools share your credit balance; each shows its generation cost before you confirm. Faceless rendering uses 20 credits; an AI-written script uses 2 more. Cartoon and UGC costs depend on the selected output. Regeneration costs additional credits. Credits are added only after confirmed payment. Applicable taxes, if any, are shown at checkout.</p>
  </div>;
}
