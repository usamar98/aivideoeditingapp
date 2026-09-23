import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cancelJob } from "@/lib/jobs/cancel";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ generationId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const parsed = z.string().uuid().safeParse((await params).generationId);
  if (!parsed.success) return Response.json({ error: "Invalid job ID" }, { status: 400 });
  const db = await createClient();
  const admin = createAdminClient();
  if (!db || !admin) return Response.json({ error: "Job service is unavailable" }, { status: 503 });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const result = await cancelJob(db, admin, user.id, parsed.data);
  return Response.json(result.body, { status: result.code, headers: { "Cache-Control": "no-store" } });
}
