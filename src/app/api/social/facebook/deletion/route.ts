import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleFacebookRemoval } from "@/lib/social/facebook-deletion";
export async function POST(request: Request) { return handleFacebookRemoval(request, true); }
export async function GET(request: Request) {
  const code = z.uuid().safeParse(new URL(request.url).searchParams.get("code")), admin = createAdminClient();
  if (!code.success) return Response.json({ error: "Invalid confirmation code" }, { status: 400 });
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });
  const result = await admin.from("facebook_deletions").select("confirmation_code").eq("confirmation_code", code.data).maybeSingle();
  if (result.error) return Response.json({ error: "Service unavailable" }, { status: 503 });
  return Response.json(result.data ? { status: "complete", message: "ETA's stored Facebook connection, tokens and publishing records have been removed. Already published Facebook content is unchanged." } : { status: "not_found", message: "Confirmation code not found or expired. Contact support@editingapp.live." }, { status: result.data ? 200 : 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
