import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getJobs } from "@/lib/jobs/repository";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const parsed = z.object({ filter: z.enum(["running", "done", "failed", "cancelled"]), page: z.coerce.number().int().min(0).max(10000) }).safeParse({ filter: query.get("filter") || "running", page: query.get("page") || 0 });
  if (!parsed.success) return Response.json({ error: "Invalid jobs filter" }, { status: 400 });
  const db = await createClient();
  if (!db) return Response.json({ error: "Jobs require a connected account." }, { status: 503 });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return Response.json(await getJobs(db, user.id, parsed.data.filter, parsed.data.page), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Jobs could not be loaded. Apply the jobs migration if this is a new deployment." }, { status: 503 });
  }
}
