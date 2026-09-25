import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeAuthNextPath } from "@/lib/auth/redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeAuthNextPath(url.searchParams.get("next"));
  const google = url.searchParams.get("provider") === "google";
  let failure = google ? "oauth" : "confirmation";
  const redirect = (target: URL) => {
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const fail = (reason: string) => {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", reason);
    target.searchParams.set("next", nextPath);
    return redirect(target);
  };

  if (url.searchParams.has("error")) {
    return fail(url.searchParams.get("error") === "access_denied" ? "oauth_cancelled" : "oauth");
  }
  if (!code) return fail(failure);

  try {
    const supabase = await createClient();
    if (!supabase) return fail(failure);
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return fail(failure);
    failure = "workspace";
    const { error: workspaceError } = await supabase.schema("api").rpc("ensure_personal_workspace", { workspace_name: "My studio" });
    if (workspaceError) return fail(failure);
    return redirect(new URL(nextPath, url.origin));
  } catch {
    return fail(failure);
  }
}
