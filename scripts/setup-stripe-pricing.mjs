import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";

/** @type {{id: string, name: string, description: string, monthlyAmount: number, annualMonthlyAmount: number, monthlyCredits: number}[]} */
const tiers = JSON.parse(readFileSync(new URL("../src/config/pricing.json", import.meta.url), "utf8"));

export function catalogEntries() {
  return tiers.flatMap((tier) => ["month", "year"].map((interval) => ({
    tier,
    interval,
    productId: `framefoundry_${tier.id}_v1`,
    lookupKey: `framefoundry_${tier.id}_${interval}_v1`,
    amount: interval === "year" ? tier.annualMonthlyAmount * 12 : tier.monthlyAmount,
    credits: tier.monthlyCredits * (interval === "year" ? 12 : 1),
  })));
}

export function matchesCatalogEntry(price, entry) {
  const product = price.product;
  return price.active && price.currency === "usd" && price.unit_amount === entry.amount
    && price.lookup_key === entry.lookupKey && price.billing_scheme === "per_unit"
    && !price.transform_quantity && price.recurring?.interval === entry.interval
    && price.recurring.interval_count === 1 && price.recurring.usage_type === "licensed"
    && Number(price.metadata.credits) === entry.credits
    && typeof product !== "string" && !product.deleted && product.active && product.metadata.app === "framefoundry";
}

// Never modify existing amounts, allocations, or subscriptions. Lookup keys and
// deterministic product IDs make retries safe, including after partial setup.
export async function syncStripeCatalog(stripe) {
  const entries = catalogEntries();
  const existing = new Map();
  for await (const price of stripe.prices.list({ lookup_keys: entries.map((entry) => entry.lookupKey), expand: ["data.product"], limit: 100 })) {
    existing.set(price.lookup_key, price);
  }
  for (const entry of entries) {
    const price = existing.get(entry.lookupKey);
    if (price && !matchesCatalogEntry(price, entry)) {
      throw new Error(`Catalog mismatch for ${entry.lookupKey}. Review it in Stripe; existing prices are never overwritten.`);
    }
  }

  const products = new Map();
  const result = [];
  for (const entry of entries) {
    if (existing.has(entry.lookupKey)) {
      result.push({ lookupKey: entry.lookupKey, status: "existing" });
      continue;
    }
    if (!products.has(entry.productId)) {
      let product;
      try {
        product = await stripe.products.retrieve(entry.productId);
      } catch (error) {
        if (error.code !== "resource_missing" || error.statusCode !== 404) throw error;
        product = await stripe.products.create({
          id: entry.productId, name: entry.tier.name, description: entry.tier.description,
          metadata: { app: "framefoundry", tier: entry.tier.id },
        }, { idempotencyKey: `catalog:product:${entry.productId}` });
      }
      if (product.deleted || !product.active || product.metadata.app !== "framefoundry" || product.metadata.tier !== entry.tier.id) {
        throw new Error(`Product conflict for ${entry.productId}. Review it in Stripe before retrying.`);
      }
      products.set(entry.productId, product);
    }
    await stripe.prices.create({
      product: entry.productId, currency: "usd", unit_amount: entry.amount,
      recurring: { interval: entry.interval, interval_count: 1, usage_type: "licensed" },
      lookup_key: entry.lookupKey, metadata: { credits: String(entry.credits) },
    }, { idempotencyKey: `catalog:price:${entry.lookupKey}` });
    result.push({ lookupKey: entry.lookupKey, status: "created" });
  }
  return result;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--apply", "--live"].includes(arg))) throw new Error("Usage: npm run billing:setup -- [--apply] [--live]");
  console.table(catalogEntries().map((entry) => ({ plan: entry.tier.name, interval: entry.interval, chargeUSD: (entry.amount / 100).toFixed(2), creditsPerPayment: entry.credits, lookupKey: entry.lookupKey })));
  if (!args.has("--apply")) {
    console.log("Preview only. No Stripe requests made. To create the catalog, set STRIPE_SECRET_KEY in your terminal environment and run with --apply (and --live for live mode).");
    return;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^[sr]k_(test|live)_/.test(key)) throw new Error("Set a valid STRIPE_SECRET_KEY in the terminal environment before applying.");
  if (/^[sr]k_live_/.test(key) && !args.has("--live")) throw new Error("Live catalog changes require both --apply and --live. Test the setup in Stripe test mode first.");
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
  console.table(await syncStripeCatalog(stripe));
  console.log("Catalog ready. Configure the customer portal and signed webhook separately; see docs/DEPLOYMENT.md.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Provider errors can contain credential fragments; never print their raw text.
    console.error(error instanceof Stripe.errors.StripeError ? `Stripe setup failed (${error.type}). Check account credentials and permissions.` : error.message);
    process.exitCode = 1;
  });
}
