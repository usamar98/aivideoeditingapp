import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "./stripe";
import { creditPackEventKey, validCreditPackSession, isPaidCreditPackSession } from "./credit-pack";

// Read-only return-page verification. URL parameters never fulfill a purchase.
export async function getCreditPackReceipt(sessionId: string, owner: { userId: string; workspaceId: string; customerId: string }, db: SupabaseClient) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9]{8,240}$/.test(sessionId)) return "Payment could not be verified. Contact support if you were charged.";
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items", "payment_intent"] });
    if (!validCreditPackSession(session, owner)) return "This payment could not be verified for your account. Contact support if you were charged.";
    if (!isPaidCreditPackSession(session)) return "Payment is not confirmed. No credits have been added by this return. Refresh status or check Stripe Checkout before trying again.";
    const { data, error } = await db.from("credit_ledger").select("amount")
      .eq("workspace_id", owner.workspaceId).eq("kind", "purchase")
      .eq("idempotency_key", creditPackEventKey(session.id)).maybeSingle();
    const prefix = session.livemode ? "$1.00 USD payment confirmed by Stripe." : "Stripe test-mode payment confirmed; no real money was collected.";
    if (error || !data || Number(data.amount) !== 10) return `${prefix} Your 10 credits are awaiting webhook confirmation. Refresh status shortly; do not pay again.`;
    return `${prefix} 10 credits were added to your balance. This was a one-time purchase, not a subscription.`;
  } catch { return "Payment verification is temporarily unavailable. Refresh status or contact support before paying again."; }
}
