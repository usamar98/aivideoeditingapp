import "server-only";
import Stripe from "stripe";
import { toOfferedBillingPlan } from "./catalog";
import { brand } from "@/config/brand";
import { requireAccount } from "@/lib/account";

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
}

export function accountReturnUrl() {
  const url = new URL("/studio/profile", brand.siteUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Set NEXT_PUBLIC_SITE_URL to your HTTPS site URL.");
  return url.toString();
}

export async function getBillingPlans() {
  const stripe = getStripe();
  const plans = [];
  for await (const price of stripe.prices.list({ active: true, type: "recurring", expand: ["data.product"], limit: 100 })) {
    const plan = toOfferedBillingPlan(price);
    if (plan) plans.push(plan);
  }
  return plans.sort((a,b) => a.amount - b.amount);
}

export async function getBillingCustomer(account: Awaited<ReturnType<typeof requireAccount>>) {
  const { data, error } = await account.admin.from("billing_customers").select("stripe_customer_id").eq("user_id", account.user.id).maybeSingle();
  if (error) throw new Error("Billing storage is unavailable. Apply the latest database migration.");
  if (data) return data.stripe_customer_id as string;
  const customer = await getStripe().customers.create({ email: account.user.email, metadata: { user_id: account.user.id, workspace_id: account.workspaceId, app: "framefoundry" } }, { idempotencyKey: `customer:${account.user.id}` });
  const { error: saveError } = await account.admin.from("billing_customers").upsert({ user_id: account.user.id, workspace_id: account.workspaceId, stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (saveError) throw new Error("Could not save the billing account. Please retry.");
  const { data: saved, error: readError } = await account.admin.from("billing_customers").select("stripe_customer_id").eq("user_id", account.user.id).single();
  if (readError || !saved) throw new Error("Could not resolve the billing account.");
  return saved.stripe_customer_id as string;
}
