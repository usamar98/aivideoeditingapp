import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { hash, seal } from "@/lib/social/crypto";
import { facebookConfig } from "@/lib/social/facebook-config";
import { exchangeFacebookCode, facebookIdentityHash, loadFacebookGrant } from "@/lib/social/facebook";

export async function GET(request: Request) {
  let origin: string;
  try { origin = facebookConfig().origin; } catch { return Response.json({ error: "Facebook is not configured." }, { status: 503 }); }
  let outcome = "connection_failed";
  try {
    const params = new URL(request.url).searchParams, state = params.get("state"), browserState = (await cookies()).get("eta_facebook_state")?.value;
    if (!state || !browserState || state.length > 100 || hash(state) !== hash(browserState)) throw new Error("Invalid state");
    const { admin, user } = await requireAccount();
    const consumed = await admin.from("facebook_oauth_states").update({ consumed: true }).eq("user_id", user.id).eq("state_hash", hash(state)).eq("consumed", false)
      .gt("expires_at", new Date().toISOString()).select("user_id").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("Expired state");
    if (params.has("error")) { outcome = "denied"; throw new Error("Denied"); }
    const code = params.get("code"); if (!code || code.length > 4096) throw new Error("Missing code");
    const grant = await loadFacebookGrant(await exchangeFacebookCode(code));
    if (!grant.pages.length) { outcome = "no_pages"; throw new Error("No eligible Pages"); }
    const saved = await admin.rpc("prepare_facebook_grant", { owner_id: user.id, state_digest: hash(state), remote_user: grant.userId, remote_hash: facebookIdentityHash(grant.userId),
      encrypted_grant: seal(JSON.stringify(grant), `facebook-grant:${user.id}`) });
    if (saved.error) throw new Error("State invalidated");
    outcome = "choose_page";
  } catch { /* Never echo callback parameters, tokens or raw provider errors. */ }
  const response = NextResponse.redirect(new URL(`/studio/social/facebook?facebook=${outcome}`, origin), 303);
  response.cookies.set("eta_facebook_state", "", { path: "/api/social/facebook", maxAge: 0, httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" });
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
