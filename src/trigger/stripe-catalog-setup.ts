import { task } from "@trigger.dev/sdk";
import { runLiveCatalogSetup } from "../lib/billing/live-catalog-setup";

// No public endpoint or automatic schedule. Only trusted Trigger operators can
// invoke this task. It provisions fixed catalog entries, never subscriptions.
export const stripeCatalogSetup = task({
  id: "stripe-catalog-setup",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async (payload: unknown, { ctx }) => runLiveCatalogSetup(payload, {
    environmentType: ctx.environment.type,
    secretKey: process.env.STRIPE_SECRET_KEY,
  }),
});
