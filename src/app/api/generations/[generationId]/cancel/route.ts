import { runs } from "@trigger.dev/sdk";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ generationId: z.string().uuid() });

export async function POST(_request: Request, { params }: { params: Promise<{ generationId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return Response.json({ error: "Invalid generation ID" }, { status: 400 });
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return Response.json({ error: "Generation service is unavailable" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { data: generation } = await supabase.from("generations").select("id,status,provider_request_id").eq("id", parsed.data.generationId).maybeSingle();
  if (!generation) return Response.json({ error: "Generation not found" }, { status: 404 });
  if (["succeeded", "failed"].includes(generation.status)) return Response.json({ error: `Generation already ${generation.status}` }, { status: 409 });
  if (generation.status === "cancelled") return Response.json({ generationId: generation.id, status: "cancelled", duplicate: true });

  if (generation.provider_request_id) {
    try {
      await runs.cancel(generation.provider_request_id);
    } catch {
      const { data: latest } = await supabase.from("generations").select("status").eq("id", generation.id).single();
      if (latest && ["succeeded", "failed"].includes(latest.status)) return Response.json({ error: `Generation already ${latest.status}` }, { status: 409 });
      return Response.json({ error: "The render worker could not confirm cancellation. Credits remain reserved until reconciliation." }, { status: 502 });
    }
  }
  const { error: settleError } = await supabase.schema("api").rpc("settle_generation_credits", { generation_id: generation.id, used_credits: 0, idempotency_key: `${generation.id}:cancel-settlement` });
  if (settleError) return Response.json({ error: settleError.message }, { status: 500 });
  const { error: updateError } = await admin.from("generations").update({ status: "cancelled", completed_at: new Date().toISOString(), error_message: "Cancelled by user" }).eq("id", generation.id).in("status", ["created", "reserved", "submitted", "processing"]);
  if (updateError) return Response.json({ error: "Could not record cancellation" }, { status: 500 });
  return Response.json({ generationId: generation.id, status: "cancelled", creditsReleased: true });
}
