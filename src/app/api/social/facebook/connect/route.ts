import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { hash, oauthSecrets } from "@/lib/social/crypto";
import { facebookConfig } from "@/lib/social/facebook-config";
import { facebookAuthorizationUrl } from "@/lib/social/facebook";

export async function POST(request: Request) {
  try {
    const config = facebookConfig();
    if (request.headers.get("origin") !== config.origin) return Response.json({ error: "Connect from the configured ETA website." }, { status: 403 });
    if ((await request.formData()).get("policy") !== "agree") return Response.json({ error: "Accept the Facebook data policy before connecting." }, { status: 400 });
    const { admin, user } = await requireAccount(), { state } = oauthSecrets();
    const result = await admin.rpc("begin_facebook_oauth", { owner_id: user.id, state_digest: hash(state) });
    if (result.error) throw new Error("Could not save state");
    const response = NextResponse.redirect(facebookAuthorizationUrl(state), 303);
    response.cookies.set("eta_facebook_state", state, { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/social/facebook", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return Response.json({ error: "Facebook connection could not start. Sign in and check its environment settings and migration." }, { status: 400 }); }
}
