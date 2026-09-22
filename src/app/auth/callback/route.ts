import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") || "/studio";
  const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/studio";
  const supabase = await createClient();

  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));

  const { error: workspaceError } = await supabase.schema("api").rpc("ensure_personal_workspace", { workspace_name: "My studio" });
  if (workspaceError) return NextResponse.redirect(new URL("/login?error=workspace", url.origin));
  return NextResponse.redirect(new URL(nextPath, url.origin));
}
