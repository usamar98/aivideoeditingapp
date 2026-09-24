import Stripe from "stripe";
import { z } from "zod";
import { toOfferedBillingPlan } from "./catalog";
import { catalogEntries, matchesCatalogEntry, syncStripeCatalog } from "./setup-stripe-catalog.mjs";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inspect") }).strict(),
  z.object({
    mode: z.literal("apply"),
    confirmation: z.literal("create-framefoundry-live-plans"),
  }).strict(),
]);

async function inspectCatalog(stripe: Stripe) {
  const entries = catalogEntries();
  const prices = new Map<string, Stripe.Price>();
  for await (const price of stripe.prices.list({
    lookup_keys: entries.map((entry) => entry.lookupKey), expand: ["data.product"], limit: 100,
  })) {
    if (price.lookup_key) prices.set(price.lookup_key, price);
  }
  return entries.map((entry) => {
    const price = prices.get(entry.lookupKey);
    const status = !price ? "missing"
      : price.livemode && matchesCatalogEntry(price, entry) && toOfferedBillingPlan(price) ? "ready" : "conflict";
    return {
      lookupKey: entry.lookupKey, plan: entry.tier.name, interval: entry.interval,
      amount: entry.amount, currency: "usd", credits: entry.credits,
      priceId: price?.id ?? null, status,
    };
  });
}

// Operator-only entry point, called by a private Trigger task, never a web route.
// Request data cannot choose amounts, credits, Stripe keys, or customer actions.
export async function runLiveCatalogSetup(payload: unknown, options: {
  environmentType: string;
  secretKey: string | undefined;
  createClient?: (key: string) => Stripe;
}) {
  const request = requestSchema.safeParse(payload);
  if (!request.success) return { ok: false, code: "invalid_request" };
  if (options.environmentType !== "PRODUCTION") return { ok: false, code: "production_only" };
  const key = options.secretKey?.trim();
  if (!key) return { ok: false, code: "missing_server_stripe_key" };
  if (!/^[sr]k_live_/.test(key)) return { ok: false, code: "live_key_required" };

  try {
    const stripe = options.createClient
      ? options.createClient(key)
      : new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    const before = await inspectCatalog(stripe);
    if (request.data.mode === "inspect") {
      return { ok: true, mode: "inspect", ready: before.every((plan) => plan.status === "ready"), plans: before };
    }
    if (before.some((plan) => plan.status === "conflict")) {
      return { ok: false, code: "catalog_conflict", plans: before };
    }
    const results = await syncStripeCatalog(stripe);
    const plans = await inspectCatalog(stripe);
    const ready = plans.every((plan) => plan.status === "ready");
    return { ok: ready, mode: "apply", ready, results, plans };
  } catch (error) {
    // Never return/log raw SDK errors or request headers: they may contain keys.
    const code = error instanceof Stripe.errors.StripeAuthenticationError ? "stripe_authentication_failed"
      : error instanceof Stripe.errors.StripePermissionError ? "stripe_permission_denied"
      : "catalog_setup_failed";
    return { ok: false, code };
  }
}
