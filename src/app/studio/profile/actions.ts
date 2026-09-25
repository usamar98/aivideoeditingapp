"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { accountReturnUrl, getBillingCustomer, getStripe } from "@/lib/billing/stripe";
import { managedSubscriptionStatuses, toOfferedBillingPlan } from "@/lib/billing/catalog";

export async function updateProfile(input: unknown) {
  try {
    const { username } = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 lowercase letters, numbers, or underscores.") }).parse(input);
    const { db, user } = await requireAccount();
    const { error } = await db.from("profiles").update({ username, display_name: username }).eq("id", user.id).select("username").single();
    if (error) throw new Error(error.code === "23505" ? "That username is already taken." : "Could not update your profile.");
    revalidatePath("/studio/profile");
    return { ok: true };
  } catch (error) { return { error: publicError(error) }; }
}

export async function changePassword(input: unknown) {
  try {
    const values = z.object({ currentPassword: z.string().min(1), password: z.string().min(12).max(128), confirmation: z.string() }).refine((v) => v.password === v.confirmation, "Passwords do not match.").parse(input);
    const { db, user } = await requireAccount();
    if (!user.email) throw new Error("A verified email is required.");
    const { error: verifyError } = await db.auth.signInWithPassword({ email: user.email, password: values.currentPassword });
    if (verifyError) throw new Error("Current password is incorrect, or authentication needs attention.");
    const { error } = await db.auth.updateUser({ password: values.password });
    if (error) throw new Error(error.message);
    const { error: sessionError } = await db.auth.signOut({ scope: "others" });
    if (sessionError) return { ok: true, warning: "Password changed. Other sessions could not be signed out; sign out on other devices." };
    return { ok: true };
  } catch (error) { return { error: publicError(error) }; }
}

export async function createCheckout(priceId: string) {
  try {
    z.string().regex(/^price_[a-zA-Z0-9]+$/).parse(priceId);
    const account = await requireAccount();
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    if (!toOfferedBillingPlan(price)) throw new Error("This plan is not available. Refresh billing to see the current plans.");
    const customer = await getBillingCustomer(account);
    const lockToken = randomUUID();
    const {data:lease,error:leaseError} = await account.admin.from("billing_customers").update({checkout_lock_token:lockToken,checkout_lock_until:new Date(Date.now()+300000).toISOString()}).eq("user_id",account.user.id).or(`checkout_lock_until.is.null,checkout_lock_until.lt.${new Date().toISOString()}`).select("user_id").maybeSingle();
    if(leaseError || !lease) throw new Error("Another checkout request is being processed. Wait a few minutes before trying again.");
    let uncertain = false;
    try {
    const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
    if (subscriptions.data.some((sub) => managedSubscriptionStatuses.has(sub.status))) throw new Error("You already have a subscription. Use Manage subscription to change your plan.");
    // Reuse an open checkout to prevent repeated clicks from starting multiple subscriptions.
    const sessions = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
    for (const session of sessions.data) {
      if (session.mode === "subscription" && session.metadata?.app === "framefoundry") {
        if (session.metadata.price_id === priceId && session.url) return { url: session.url };
        await stripe.checkout.sessions.expire(session.id);
      }
    }
    uncertain = true;
    const session = await stripe.checkout.sessions.create({
      customer, mode: "subscription", client_reference_id: account.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { app: "framefoundry", price_id: priceId },
      subscription_data: { metadata: { app: "framefoundry", workspace_id: account.workspaceId } },
      success_url: `${accountReturnUrl()}?checkout=success`, cancel_url: `${accountReturnUrl()}?checkout=cancelled`,
    }, { idempotencyKey: `checkout:${account.user.id}:${lockToken}` });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    uncertain = false;
    return { url: session.url };
    } finally {
      // Keep the short lease after an uncertain network response; a retry can discover the open session.
      if(!uncertain) await account.admin.from("billing_customers").update({checkout_lock_token:null,checkout_lock_until:null}).eq("user_id",account.user.id).eq("checkout_lock_token",lockToken);
    }
  } catch (error) { return { error: publicError(error) }; }
}

export async function openBillingPortal(action: "manage" | "payment" | "cancel" = "manage") {
  try {
    z.enum(["manage", "payment", "cancel"]).parse(action);
    const account = await requireAccount();
    const { data, error } = await account.admin.from("billing_customers").select("stripe_customer_id").eq("user_id", account.user.id).maybeSingle();
    if (error || !data) throw new Error("Subscribe to a plan before opening billing settings.");
    const stripe = getStripe();
    const returnUrl = accountReturnUrl();
    const subscription = action === "cancel" ? (await stripe.subscriptions.list({ customer: data.stripe_customer_id, status: "all", limit: 100 })).data.find((s) => managedSubscriptionStatuses.has(s.status)) : undefined;
    if (action === "cancel" && !subscription) throw new Error("There is no subscription to cancel.");
    const session = await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: returnUrl,
      ...(action === "payment" ? { flow_data: { type: "payment_method_update" as const, after_completion: { type: "redirect" as const, redirect: { return_url: returnUrl } } } } : {}),
      ...(action === "cancel" && subscription ? { flow_data: { type: "subscription_cancel" as const, subscription_cancel: { subscription: subscription.id }, after_completion: { type: "redirect" as const, redirect: { return_url: returnUrl } } } } : {}),
    });
    return { url: session.url };
  } catch (error) { return { error: publicError(error) }; }
}
