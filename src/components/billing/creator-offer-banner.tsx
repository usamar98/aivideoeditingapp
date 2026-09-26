"use client";

import { useEffect, useState } from "react";
import { Clock3, Gift } from "lucide-react";
import { creatorOffer, formatOfferCountdown, isCreatorOfferActive } from "@/lib/billing/creator-offer";

export function useCreatorOfferClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval> | undefined;
    async function sync() {
      try {
        const response = await fetch("/api/billing/creator-offer", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const clock = await response.json();
        if (clock.id !== creatorOffer.id || !Number.isFinite(clock.now) || clock.endsAt !== creatorOffer.endsAt || controller.signal.aborted) return;
        const receivedAt = performance.now();
        if (interval) clearInterval(interval);
        setNow(clock.now);
        interval = setInterval(() => setNow(clock.now + performance.now() - receivedAt), 1000);
      } catch { /* Leave the regular plan available; checkout still validates campaign eligibility. */ }
    }
    void sync();
    window.addEventListener("focus", sync);
    return () => { controller.abort(); if (interval) clearInterval(interval); window.removeEventListener("focus", sync); };
  }, []);
  return { now, active: now !== null && isCreatorOfferActive(now) };
}

export function CreatorOfferBanner({ now }: { now: number }) {
  if (!isCreatorOfferActive(now)) return null;
  return <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4" data-testid="creator-offer">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Gift className="size-4 shrink-0" />24-hour Creator offer</p>
    <h4 className="mt-2 text-lg font-semibold">Get your second month free</h4>
    <p className="mt-2 text-sm leading-6">$49.99 today. Two months of access with 1,100 credits included for the two-month period.</p>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-primary"><Clock3 className="size-4" /><span className="text-xs">Time left to claim</span><span role="timer" aria-live="off" aria-label="Time left to start offer checkout" className="rounded-md bg-primary px-2.5 py-1 font-mono text-lg font-semibold tabular-nums text-primary-foreground">{formatOfferCountdown(Date.parse(creatorOffer.endsAt) - now)}</span></div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">New subscribers · Creator monthly base plan. Then $49.99/month with 1,100 credits per paid month. Cancel future renewals anytime. Start checkout before the timer ends; your offer is reserved for {creatorOffer.checkoutMinutes} minutes.</p>
  </div>;
}
