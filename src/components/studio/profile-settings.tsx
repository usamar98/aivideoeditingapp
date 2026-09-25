"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, LockKeyhole, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changePassword, createCheckout, openBillingPortal, updateProfile } from "@/app/studio/profile/actions";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";
import type { BillingInterval } from "@/lib/billing/pricing";
import { PricingCards } from "@/components/billing/pricing-cards";
import { createClient } from "@/lib/supabase/client";
import { CreditPackCard } from "@/components/billing/credit-pack-card";
import { createCreditPackCheckout } from "@/app/studio/profile/credit-pack-actions";

export type SubscriptionView = { status: string; plan_name: string; cancel_at_period_end: boolean; current_period_end: string | null };
export function ProfileSettings({ email, initialUsername, demo, plans, subscription, credits, billingMessage, creditPackMessage, creditPackReady = false, stripeTestMode = false, initialTab = "profile", initialInterval = "month", selectedTier }: { email: string; initialUsername: string; demo: boolean; plans: OfferedBillingPlan[]; subscription: SubscriptionView | null; credits: number; billingMessage: string | null; creditPackMessage?: string | null; creditPackReady?: boolean; stripeTestMode?: boolean; initialTab?: "profile" | "billing"; initialInterval?: BillingInterval; selectedTier?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function run(action: () => Promise<{ error?: string; url?: string; ok?: boolean; warning?: string }>, success?: string) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) { setMessage(result.error); return; }
        if (result.url) { window.location.assign(result.url); return; }
        setMessage(result.warning || success || "Saved."); toast.success(success || "Saved.");
        setCurrentPassword(""); setPassword(""); setConfirmation(""); router.refresh();
      } catch { setMessage("Unable to connect. Please try again."); }
    });
  }
  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8"><p className="eyebrow text-primary">Your space</p><h1 className="editorial mt-3 text-4xl">Account & preferences</h1><p className="mt-3 text-muted-foreground">A little housekeeping. Then back to making things.</p>
    {demo && <p className="mt-6 rounded-xl border border-primary/20 bg-accent/50 p-4 text-sm">Demo account preview. Connect Supabase and sign in to save personal details or use billing. No account changes or payments are simulated.</p>}
    <div className="my-8 flex items-center gap-4"><span className="grid size-16 place-items-center rounded-full bg-accent text-2xl font-semibold text-primary">{(username || email || "C").slice(0,2).toUpperCase()}</span><div><p className="font-semibold">{username || "Your creator account"}</p><p className="mt-1 text-sm text-muted-foreground">{email}</p></div></div>
    <Tabs defaultValue={initialTab}><TabsList className="mb-7"><TabsTrigger value="profile"><UserRound className="mr-2 size-4" />Profile</TabsTrigger><TabsTrigger value="billing"><CreditCard className="mr-2 size-4" />Billing</TabsTrigger><TabsTrigger value="security"><LockKeyhole className="mr-2 size-4" />Security</TabsTrigger></TabsList>
      <TabsContent value="profile"><Card className="p-6 sm:p-8"><h2 className="text-lg font-semibold">Personal information</h2><p className="mt-2 text-sm text-muted-foreground">Choose the name you use in your creative workspace.</p><form className="mt-6 max-w-md space-y-5" onSubmit={(e) => { e.preventDefault(); run(() => updateProfile({ username }), "Profile updated."); }}><div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" minLength={3} maxLength={30} pattern="[a-z0-9_]{3,30}" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required /><p className="text-xs text-muted-foreground">3–30 lowercase letters, numbers, or underscores.</p></div><div className="space-y-2"><Label htmlFor="account-email">Email address</Label><Input id="account-email" value={email} disabled /><p className="text-xs text-muted-foreground">Your verified sign-in email.</p></div><Button disabled={pending || demo}>Save profile</Button></form></Card></TabsContent>
      <TabsContent value="security"><Card className="p-6 sm:p-8"><h2 className="text-lg font-semibold">Change password</h2><p className="mt-2 text-sm text-muted-foreground">Verify your current password first. Other sessions are signed out after a successful change.</p><form className="mt-6 max-w-md space-y-5" onSubmit={(e) => { e.preventDefault(); if (password !== confirmation) { setMessage("Passwords do not match."); return; } run(() => changePassword({currentPassword,password,confirmation}), "Password changed successfully."); }}>{[{id:"current-password",label:"Current password",value:currentPassword,set:setCurrentPassword,auto:"current-password"},{id:"new-password",label:"New password",value:password,set:setPassword,auto:"new-password"},{id:"confirm-password",label:"Confirm new password",value:confirmation,set:setConfirmation,auto:"new-password"}].map((field) => <div className="space-y-2" key={field.id}><Label htmlFor={field.id}>{field.label}</Label><Input id={field.id} type="password" required minLength={field.auto === "new-password" ? 12 : 1} maxLength={128} autoComplete={field.auto} value={field.value} onChange={(e) => field.set(e.target.value)} /></div>)}<p className="text-xs text-muted-foreground">Use at least 12 characters for your new password.</p><Button disabled={pending || demo}>Update password</Button></form></Card></TabsContent>
      <TabsContent value="billing"><Card className="p-6 sm:p-8"><div className="flex flex-wrap justify-between gap-5"><div><p className="eyebrow text-primary">Current subscription</p><h2 className="mt-3 text-2xl font-semibold">{subscription?.plan_name || "No active plan"}</h2><p className="mt-2 text-sm capitalize text-muted-foreground">{subscription?.status.replaceAll("_"," ") || "Choose a plan below to get started"}</p>{subscription?.current_period_end && <p className="mt-3 text-sm">{subscription.cancel_at_period_end ? "Cancellation scheduled for" : "Current period ends"} {new Date(subscription.current_period_end).toLocaleDateString("en-US", {dateStyle:"medium",timeZone:"UTC"})}.</p>}</div><div className="rounded-xl bg-accent/60 px-6 py-4"><p className="text-3xl font-semibold text-primary">{credits}</p><p className="mt-1 text-xs text-muted-foreground">Available credits</p></div></div>
        {billingMessage && <p className="mt-5 rounded-lg bg-secondary p-3 text-sm" role="status">{billingMessage}</p>}
        <div className="mt-6 flex flex-wrap gap-3"><Button variant="outline" disabled={pending || demo || !subscription} onClick={() => run(() => openBillingPortal("manage"))}>Manage subscription <ExternalLink /></Button><Button variant="outline" disabled={pending || demo || !subscription} onClick={() => run(() => openBillingPortal("payment"))}>Update payment method</Button>{subscription && !["canceled","incomplete_expired"].includes(subscription.status) && !subscription.cancel_at_period_end && <Button variant="ghost" className="text-destructive" disabled={pending || demo} onClick={() => run(() => openBillingPortal("cancel"))}>Cancel subscription</Button>}<Button variant="ghost" disabled={pending} onClick={() => router.refresh()}>Refresh status</Button></div><p className="mt-4 text-xs leading-6 text-muted-foreground">Stripe securely handles cards, invoices, plan changes, and cancellation confirmation. No card details are stored here. Credits arrive after a confirmed paid invoice; prorated changes do not grant another full credit allocation.</p></Card>
        {creditPackMessage && <p role="status" className="mt-6 rounded-xl border border-primary/20 bg-accent/50 p-4 text-sm">{creditPackMessage}</p>}
        <CreditPackCard mode="billing" pending={pending} demo={demo} ready={creditPackReady} testMode={stripeTestMode} onBuy={() => run(createCreditPackCheckout)} />
        <h2 className="mb-2 mt-8 text-lg font-semibold">Choose your credit budget</h2>
        <p className="mb-6 text-sm text-muted-foreground">Monthly credits, or twelve months of credits upfront with yearly billing.</p>
        <PricingCards mode="billing" plans={plans} pending={pending} demo={demo} hasSubscription={Boolean(subscription && !["canceled","incomplete_expired"].includes(subscription.status))} onChoose={(priceId) => run(() => createCheckout(priceId))} initialInterval={initialInterval} selectedTier={selectedTier} />
      </TabsContent>
    </Tabs>{message && <p className="mt-5 rounded-xl border border-primary/20 bg-accent/50 p-4 text-sm" role="status">{message}</p>}<Button variant="ghost" className="mt-8" disabled={demo || pending} onClick={() => run(async () => { const client = createClient(); if (!client) return {error:"Authentication is not configured."}; const {error} = await client.auth.signOut(); if (error) return {error:error.message}; router.push("/login"); return {ok:true}; }, "Signed out.")}><LogOut /> Sign out</Button>
  </main>;
}
