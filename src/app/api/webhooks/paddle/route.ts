import { z } from "zod";

import { verifyPaddleWebhook } from "@/lib/billing/paddle";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  data: z.object({
    id: z.string(),
    custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
    items: z.array(z.object({ quantity: z.number().int().positive(), price: z.object({ id: z.string() }).passthrough() }).passthrough()).default([]),
  }).passthrough(),
}).passthrough();

const priceMapSchema = z.record(z.string(), z.number().positive());

function getCreditPriceMap() {
  try {
    return priceMapSchema.parse(JSON.parse(process.env.PADDLE_CREDIT_PRICE_MAP_JSON || "{}"));
  } catch {
    throw new Error("PADDLE_CREDIT_PRICE_MAP_JSON is invalid.");
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyPaddleWebhook(rawBody, request.headers.get("paddle-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const event = eventSchema.safeParse(parsedBody);
  if (!event.success) return Response.json({ error: "Invalid event" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "Billing persistence is unavailable" }, { status: 503 });
  let { data: inserted, error } = await supabase
    .from("webhook_events")
    .insert({ id: event.data.event_id, provider: "paddle", event_type: event.data.event_type, payload: event.data })
    .select("id,processed_at")
    .single();
  if (error?.code === "23505") {
    const existing = await supabase.from("webhook_events").select("id,processed_at").eq("id", event.data.event_id).single();
    inserted = existing.data;
    error = existing.error;
  }
  if (error) return Response.json({ error: "Could not persist webhook" }, { status: 500 });
  if (!inserted) return Response.json({ error: "Could not persist webhook" }, { status: 500 });
  if (inserted.processed_at) return Response.json({ received: true, duplicate: true });

  if (event.data.event_type === "transaction.completed") {
    const custom = event.data.data.custom_data || {};
    const workspaceId = typeof custom.workspace_id === "string" ? custom.workspace_id : null;
    const priceMap = getCreditPriceMap();
    const credits = event.data.data.items.reduce((total, item) => total + (priceMap[item.price.id] || 0) * item.quantity, 0);
    if (workspaceId && Number.isFinite(credits) && credits > 0) {
      const { error: purchaseError } = await supabase.rpc("apply_credit_purchase", { target_workspace_id: workspaceId, credit_amount: credits, event_key: `paddle:${event.data.event_id}`, external_id: event.data.data.id });
      if (purchaseError) return Response.json({ error: "Could not apply credit purchase" }, { status: 500 });
    } else return Response.json({ error: "Transaction has no recognized credit price or workspace" }, { status: 422 });
  }
  await supabase.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", event.data.event_id);
  return Response.json({ received: true });
}
