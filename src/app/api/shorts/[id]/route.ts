import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getShortsProject } from "@/lib/shorts/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" }, { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project" }, { status: 400, headers });
  const db = await createClient();
  if (!db) return NextResponse.json({ error: "Sign in to continue" }, { status: 401, headers });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401, headers });
  try {
    const project = await getShortsProject(db, user.id, id);
    return NextResponse.json(project || { error: "Project not found" }, { status: project ? 200 : 404, headers });
  } catch { return NextResponse.json({ error: "Could not refresh Shorts progress. Retry shortly." }, { status: 503, headers }); }
}
