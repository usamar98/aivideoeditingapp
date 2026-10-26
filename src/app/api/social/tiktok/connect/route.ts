import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { hash, oauthSecrets } from "@/lib/social/crypto";
import { tiktokConfig, tiktokConfigured } from "@/lib/social/tiktok-config";
import { tiktokAuthorizationUrl } from "@/lib/social/tiktok";

export async function POST(request: Request) {
  try {
    const config = tiktokConfig();
    if (!tiktokConfigured()) throw new Error("Not configured");
    if (request.headers.get("origin") !== config.origin) return Response.json({ error: "Connect from the configured Create AI Videos website." }, { status: 403 });
    if ((await request.formData()).get("policy") !== "agree") return Response.json({ error: "Accept the TikTok connection policy before connecting." }, { status: 400 });
    const { admin, user } = await requireAccount(), { state } = oauthSecrets();
    const saved = await admin.rpc("begin_tiktok_oauth", { owner_id: user.id, state_digest: hash(state) });
    if (saved.error) throw new Error("State unavailable");
    const response = NextResponse.redirect(tiktokAuthorizationUrl(state), 303);
    response.cookies.set("cav_tiktok_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/social/tiktok", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return Response.json({ error: "TikTok connection could not start. Sign in and check its configuration and migration." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
