// A static import also bundles the catalog into the hosted Trigger worker.
import tiers from "../../config/pricing.json" with { type: "json" };
import discounts from "../../config/credit-bundles.json" with { type: "json" };

export function catalogEntries() {
  return tiers.flatMap((tier) => ["month", "year"].flatMap((interval) => [1, 2, 3].map((quantity) => ({
    tier,
    interval, quantity,
    productId: `framefoundry_${tier.id}_v1`,
    lookupKey: quantity === 1 ? `framefoundry_${tier.id}_${interval}_v1` : `framefoundry_${tier.id}_${interval}_bundle${quantity}_v1`,
    amount: Math.round((interval === "year" ? tier.annualMonthlyAmount * 12 : tier.monthlyAmount) * quantity * (100 - discounts[quantity]) / 100),
    credits: tier.monthlyCredits * (interval === "year" ? 12 : 1) * quantity,
  }))));
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
