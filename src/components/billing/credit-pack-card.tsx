"use client";

import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { creditPack, creditPackAccountHref } from "@/lib/billing/credit-pack";

type Props = { mode?: "marketing" } | { mode: "billing"; pending: boolean; demo: boolean; ready: boolean; testMode: boolean; onBuy: () => void };

export function CreditPackCard(props: Props) {
  if (!creditPack.enabled) return null;
  const billing = props.mode === "billing";
  return <Card id="mini-credit-pack" className="mt-8 scroll-mt-24 overflow-hidden border-primary/30 bg-accent/30 p-6 sm:p-8">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow text-primary">Temporary offer · one-time purchase</p>
        <h3 className="mt-3 flex items-center gap-2 text-xl font-semibold"><Coins className="size-5 shrink-0 text-primary" />{creditPack.name}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{creditPack.credits} app credits for a small top-up. No subscription, no automatic renewal, and no changes to your existing plan.</p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Credits are added after confirmed payment. Most video workflows need more than 10 credits; check the studio’s estimate before generating.</p>
      </div>
      <div className="shrink-0 sm:min-w-48 sm:text-right">
        <p className="text-4xl font-semibold tracking-tight">$1.00 <span className="text-sm font-normal text-muted-foreground">USD once</span></p>
        <p className="mb-4 mt-2 text-xs text-primary">{creditPack.credits} credits · not monthly</p>
        {billing ? <Button className="w-full" disabled={props.pending || props.demo || !props.ready} onClick={props.onBuy}>
          {props.pending ? "Please wait…" : props.demo ? "Demo preview" : !props.ready ? "Payments unavailable" : "Buy 10 credits · $1.00"}<ArrowRight />
        </Button> : <Button asChild className="w-full"><Link href={creditPackAccountHref}>Get 10 credits · $1.00<ArrowRight /></Link></Button>}
        {billing && !props.demo && props.ready && <p className="mt-3 max-w-64 text-xs leading-5 text-muted-foreground">{props.testMode ? "Stripe test mode: no real money is collected." : "Real purchase. Review and pay securely on Stripe."}</p>}
      </div>
    </div>
  </Card>;
}
