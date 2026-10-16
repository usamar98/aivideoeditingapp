import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { hash, seal } from "@/lib/social/crypto";
import { facebookConfig } from "@/lib/social/facebook-config";
import { exchangeFacebookCode, facebookIdentityHash, FacebookGrantError, loadFacebookGrant } from "@/lib/social/facebook";
import { logFacebookOAuthResult, type FacebookGrantDiagnostics, type FacebookOAuthOutcome, type FacebookOAuthStage } from "@/lib/social/facebook-oauth-diagnostics";

export async function GET(request: Request) {
  const reference = randomUUID();
  let origin: string;
  try { origin = facebookConfig().origin; } catch {
    logFacebookOAuthResult(reference, "connection_failed", "configuration");
    return Response.json({ error: "Facebook is not configured.", reference }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let outcome: FacebookOAuthOutcome = "connection_failed", stage: FacebookOAuthStage = "validate_state";
  let diagnostics: FacebookGrantDiagnostics | undefined;
  try {
    const params = new URL(request.url).searchParams, state = params.get("state"), browserState = (await cookies()).get("eta_facebook_state")?.value;
    if (!state || !browserState || state.length > 100 || hash(state) !== hash(browserState)) throw new Error("Invalid state");
    stage = "authenticate";
    const { admin, user } = await requireAccount();
    stage = "consume_state";
    const consumed = await admin.from("facebook_oauth_states").update({ consumed: true }).eq("user_id", user.id).eq("state_hash", hash(state)).eq("consumed", false)
      .gt("expires_at", new Date().toISOString()).select("user_id").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("Expired state");
    stage = "authorization";
    if (params.has("error")) { outcome = "denied"; throw new Error("Denied"); }
    const code = params.get("code"); if (!code || code.length > 4096) throw new Error("Missing code");
    stage = "exchange_code";
    const token = await exchangeFacebookCode(code);
    stage = "page_discovery";
    const { diagnostics: grantDiagnostics, ...grant } = await loadFacebookGrant(token);
    diagnostics = grantDiagnostics;
    if (!grant.pages.length) throw new Error("Empty grant");
    stage = "save_grant";
    const saved = await admin.rpc("prepare_facebook_grant", { owner_id: user.id, state_digest: hash(state), remote_user: grant.userId, remote_hash: facebookIdentityHash(grant.userId),
      encrypted_grant: seal(JSON.stringify(grant), `facebook-grant:${user.id}`) });
    if (saved.error) throw new Error("State invalidated");
    outcome = "choose_page";
    stage = "complete";
  } catch (error) {
    if (error instanceof FacebookGrantError) { outcome = error.outcome; diagnostics = error.diagnostics; }
    // Never echo callback parameters, tokens or raw provider errors.
  }
  logFacebookOAuthResult(reference, outcome, stage, diagnostics);
  const destination = new URL("/studio/social/facebook", origin);
  destination.searchParams.set("facebook", outcome);
  if (outcome !== "choose_page" && outcome !== "denied") destination.searchParams.set("facebook_ref", reference);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set("eta_facebook_state", "", { path: "/api/social/facebook", maxAge: 0, httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" });
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
