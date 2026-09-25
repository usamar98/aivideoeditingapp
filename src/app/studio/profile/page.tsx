import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { ProfileSettings, type SubscriptionView } from "@/components/studio/profile-settings";
import { createClient, getViewer } from "@/lib/supabase/server";
import { getBillingPlans, getStripe } from "@/lib/billing/stripe";
import type { OfferedBillingPlan } from "@/lib/billing/catalog";
import { pricingAccountHref, pricingTiers } from "@/lib/billing/pricing";
import { getCreditPackReceipt } from "@/lib/billing/credit-pack-receipt";

export const metadata = { title: "Your account", robots: { index: false, follow: false } };

export default async function ProfilePage({searchParams}: {searchParams: Promise<{checkout?:string;tab?:string;plan?:string;interval?:string;credit_pack?:string;session_id?:string}>}) {
  const query = await searchParams;
  const selectedTier = pricingTiers.find((tier) => tier.id === query.plan)?.id;
  const initialInterval = query.interval === "year" ? "year" : "month";
  const initialTab = query.tab === "billing" || query.checkout || query.credit_pack || selectedTier ? "billing" : "profile";
  const viewer = await getViewer();
  if (!viewer) {
    const next = selectedTier ? pricingAccountHref(selectedTier, initialInterval) : initialTab === "billing" ? "/studio/profile?tab=billing" : "/studio/profile";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  let username = viewer.fixture ? "demo_creator" : "";
  let credits = 0;
  let subscription: SubscriptionView | null = null;
  let plans: OfferedBillingPlan[] = [];
  let creditPackMessage: string | null = query.credit_pack === "cancelled" ? "Credit pack checkout was closed without completing payment here. No subscription was created. You can resume the open checkout if you want to purchase." : query.credit_pack === "returned" ? "Payment is not verified yet. Refresh status or contact support before paying again." : null;
  let billingMessage: string | null = query.checkout === "success" ? "Checkout returned successfully. Credits appear after Stripe confirms the paid invoice; use Refresh status if it is still processing." : query.checkout === "cancelled" ? "Checkout was cancelled. No subscription was created by this return." : null;
  const db = await createClient();
  if (db && !viewer.fixture) {
    const [profile, workspace, billing] = await Promise.all([db.from("profiles").select("username").eq("id",viewer.id).maybeSingle(), db.from("workspaces").select("id").eq("owner_id",viewer.id).order("created_at").limit(1).maybeSingle(), db.from("billing_customers").select("stripe_customer_id").eq("user_id",viewer.id).maybeSingle()]);
    username = profile.data?.username || "";
    if (workspace.data) { const {data} = await db.from("credit_accounts").select("cached_balance").eq("workspace_id",workspace.data.id).maybeSingle(); credits = Number(data?.cached_balance || 0); }
    const {data: saved} = await db.from("billing_subscriptions").select("status,plan_name,cancel_at_period_end,current_period_end").eq("user_id",viewer.id).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    subscription = saved;
    if (billing.error || profile.error) billingMessage = "Account storage needs the latest database migration before all settings are available.";
    if (query.credit_pack === "returned" && typeof query.session_id === "string" && billing.data && workspace.data) {
      creditPackMessage = await getCreditPackReceipt(query.session_id, { userId: viewer.id, workspaceId: workspace.data.id, customerId: billing.data.stripe_customer_id }, db);
    }
    if (billing.data && process.env.STRIPE_SECRET_KEY) {
      try {
        const list = await getStripe().subscriptions.list({customer:billing.data.stripe_customer_id,status:"all",expand:["data.items.data.price.product"],limit:100});
        const current = list.data.find((sub) => !["canceled","incomplete_expired"].includes(sub.status)) || list.data[0];
        if (current) { const item = current.items.data[0]; const product = item?.price.product; subscription = {status:current.status,plan_name:product && typeof product !== "string" && !product.deleted ? product.name : "Subscription",cancel_at_period_end:current.cancel_at_period_end,current_period_end:item?.current_period_end ? new Date(item.current_period_end*1000).toISOString():null}; }
      } catch { billingMessage = "Stripe is temporarily unavailable. Showing the last saved status; please refresh before making changes."; }
    }
  }
  if (!viewer.fixture && process.env.STRIPE_SECRET_KEY) { try { plans = await getBillingPlans(); } catch { billingMessage = "Billing plans could not be loaded. Please try again later."; } }
  if (!process.env.STRIPE_SECRET_KEY) billingMessage = "Stripe is not connected yet. Billing actions become available after setup.";
  return <WorkspaceShell title="Account settings" active="My account"><ProfileSettings email={viewer.email} initialUsername={username} demo={viewer.fixture} credits={credits} subscription={subscription} plans={plans} billingMessage={billingMessage} creditPackMessage={creditPackMessage} creditPackReady={Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)} stripeTestMode={Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || process.env.STRIPE_SECRET_KEY?.startsWith("rk_test_"))} initialTab={initialTab} initialInterval={initialInterval} selectedTier={selectedTier} /></WorkspaceShell>;
}
