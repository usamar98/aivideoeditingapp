"use server";

import { randomUUID } from "node:crypto";
import { requireAccount, publicError } from "@/lib/account";
import { accountReturnUrl, getBillingCustomer, getStripe } from "@/lib/billing/stripe";
import { creditPack, isCreditPackSession, validCreditPackSession } from "@/lib/billing/credit-pack";

export async function createCreditPackCheckout() {
  try {
    if (!creditPack.enabled) throw new Error("This temporary credit pack is no longer available.");
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Payment confirmation is not configured yet. Please contact support.");
    const account = await requireAccount();
    const stripe = getStripe();
    const customer = await getBillingCustomer(account);
    const lockToken = randomUUID();
    const { data: lease, error } = await account.admin.from("billing_customers")
      .update({ checkout_lock_token: lockToken, checkout_lock_until: new Date(Date.now() + 300000).toISOString() })
      .eq("user_id", account.user.id).or(`checkout_lock_until.is.null,checkout_lock_until.lt.${new Date().toISOString()}`)
      .select("user_id").maybeSingle();
    if (error || !lease) throw new Error("Another checkout request is being processed. Wait a few minutes before trying again.");
    let uncertain = false;
    try {
      const sessions = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
      for (const existing of sessions.data) {
        if (!isCreditPackSession(existing)) continue;
        const session = await stripe.checkout.sessions.retrieve(existing.id, { expand: ["line_items"] });
        if (session.status === "open" && session.url && validCreditPackSession(session, { customerId: customer, userId: account.user.id, workspaceId: account.workspaceId })) return { url: session.url };
        throw new Error("An earlier pack checkout needs review. Please contact support before buying again.");
      }
      // Do not alter or expire a subscription checkout when buying a one-time pack.
      const metadata = { app: "framefoundry", purchase_kind: "credit_pack", credit_pack_id: creditPack.id, credits: String(creditPack.credits), user_id: account.user.id, workspace_id: account.workspaceId };
      uncertain = true;
      const session = await stripe.checkout.sessions.create({
        customer, mode: "payment", client_reference_id: account.user.id,
        payment_method_types: ["card"], allow_promotion_codes: false,
        adaptive_pricing: { enabled: false }, automatic_tax: { enabled: false },
        line_items: [{ quantity: 1, price_data: { currency: creditPack.currency, unit_amount: creditPack.amount, product_data: {
          name: `ETA ${creditPack.name} — ${creditPack.credits} credits`,
          description: "One-time purchase of 10 ETA app credits. No subscription or automatic renewal.", metadata: { app: "framefoundry", credit_pack_id: creditPack.id },
        } } }],
        metadata, payment_intent_data: { metadata },
        expires_at: Math.floor(Date.now() / 1000) + 1860,
        success_url: `${accountReturnUrl()}?tab=billing&credit_pack=returned&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${accountReturnUrl()}?tab=billing&credit_pack=cancelled`,
      }, { idempotencyKey: `credit-pack:${account.user.id}:${lockToken}` });
      if (!session.url) throw new Error("Stripe did not return a checkout URL. Wait a few minutes before retrying.");
      uncertain = false;
      return { url: session.url };
    } finally {
      // Retain the lease when submission may have succeeded but the response was lost.
      if (!uncertain) await account.admin.from("billing_customers").update({ checkout_lock_token: null, checkout_lock_until: null }).eq("user_id", account.user.id).eq("checkout_lock_token", lockToken);
    }
  } catch (error) { return { error: publicError(error) }; }
}
