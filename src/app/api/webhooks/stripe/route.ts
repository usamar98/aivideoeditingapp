import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { isCreditInvoice } from "@/lib/billing/catalog";
import { creditPack, creditPackEventKey, isCreditPackSession, validCreditPackSession, isPaidCreditPackSession } from "@/lib/billing/credit-pack";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = createAdminClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!admin || !secret || !process.env.STRIPE_SECRET_KEY) return Response.json({ error: "Billing is not configured" }, { status: 503 });
  const stripe = getStripe();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") || "", secret); }
  catch { return Response.json({ error: "Invalid webhook signature" }, { status: 400 }); }

  const accepted = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"];
  if (!accepted.includes(event.type)) return Response.json({ received: true });
  try {
    const { data: previous, error: previousError } = await admin.from("webhook_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (previousError) throw previousError;
    if (previous?.processed_at) return Response.json({ received: true, duplicate: true });
    const object = event.data.object as unknown as { customer: string | { id: string } | null };
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    if (!customerId) return Response.json({ received: true });
    const { data: customer, error: customerError } = await admin.from("billing_customers").select("user_id,workspace_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return Response.json({ received: true, ignored: true });
    const { error: insertError } = await admin.from("webhook_events").upsert({ id: event.id, provider: "stripe", event_type: event.type, payload: { customer: customerId } }, { onConflict: "id", ignoreDuplicates: true });
    if (insertError) throw insertError;
    if (event.type.startsWith("checkout.session.") && (event.data.object as Stripe.Checkout.Session).mode === "payment") {
      const snapshot = event.data.object as Stripe.Checkout.Session;
      if (!isCreditPackSession(snapshot)) return Response.json({ received: true, ignored: true });
      const session = await stripe.checkout.sessions.retrieve(snapshot.id, { expand: ["line_items", "payment_intent"] });
      if (!validCreditPackSession(session, { customerId, userId: customer.user_id, workspaceId: customer.workspace_id })) throw new Error("Credit pack checkout does not match its fixed terms or account.");
      if (isPaidCreditPackSession(session)) {
        // Session identity (not event identity) prevents double grants across
        // event retries, concurrent delivery and async success notifications.
        const { error } = await admin.rpc("apply_credit_purchase", { target_workspace_id: customer.workspace_id, credit_amount: creditPack.credits, event_key: creditPackEventKey(session.id), external_id: session.id });
        if (error) throw error;
      }
      const { error } = await admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
      if (error) throw error;
      return Response.json({ received: true });
    }
    // Fetch current state instead of replaying stale subscription snapshots from delayed events.
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", expand: ["data.items.data.price.product"], limit: 100 });
    for (const sub of subscriptions.data) {
      const item = sub.items.data[0];
      const product = item?.price.product;
      const { error } = await admin.from("billing_subscriptions").upsert({ stripe_subscription_id: sub.id, user_id: customer.user_id, status: sub.status, plan_name: product && typeof product !== "string" && !product.deleted ? product.name : "Subscription", cancel_at_period_end: sub.cancel_at_period_end, current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    if (event.type === "invoice.paid") {
      const invoice = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id);
      if (isCreditInvoice(invoice.billing_reason, invoice.status === "paid", invoice.amount_paid)) {
        let credits = 0;
        for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
          const priceRef = line.pricing?.price_details?.price;
          const priceId = typeof priceRef === "string" ? priceRef : priceRef?.id;
          if (!priceId || line.amount <= 0 || line.parent?.subscription_item_details?.proration) continue;
          const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
          const product = price.product;
          const quantity = line.quantity || 1;
          const creditAmount = Number(price.metadata.credits);
          if (typeof product !== "string" && !product.deleted && product.metadata.app === "framefoundry" && Number.isSafeInteger(creditAmount) && creditAmount > 0 && creditAmount <= 100000 && quantity === 1) credits += creditAmount;
        }
        if (credits > 0) {
          const { error } = await admin.rpc("apply_credit_purchase", { target_workspace_id: customer.workspace_id, credit_amount: credits, event_key: `stripe:invoice:${invoice.id}`, external_id: invoice.id });
          if (error) throw error;
        }
      }
    }
    const { error: processedError } = await admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    if (processedError) throw processedError;
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", event.id, error instanceof Error ? error.message : "Database operation failed");
    return Response.json({ error: "Webhook processing failed; retry required" }, { status: 500 });
  }
}
