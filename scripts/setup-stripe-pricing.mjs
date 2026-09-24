import { pathToFileURL } from "node:url";
import Stripe from "stripe";
import { catalogEntries, syncStripeCatalog } from "../src/lib/billing/setup-stripe-catalog.mjs";
export { catalogEntries, matchesCatalogEntry, syncStripeCatalog } from "../src/lib/billing/setup-stripe-catalog.mjs";

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
