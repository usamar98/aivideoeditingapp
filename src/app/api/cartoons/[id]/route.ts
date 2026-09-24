import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCartoonProject } from "@/lib/cartoons/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const db = await createClient();
  if (!db) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    const project = await getCartoonProject(db, user.id, id);
    return NextResponse.json(project || { error: "Project not found" }, { status: project ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Could not refresh the project. Your edits are preserved; retry in a moment." }, { status: 503 }); }
}
