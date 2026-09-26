import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { youtubeConfig } from "@/lib/social/config";
import { authorizationUrl } from "@/lib/social/youtube";
import { hash, oauthSecrets, seal } from "@/lib/social/crypto";
import { connection } from "@/lib/social/repository";

export async function POST(request: Request) {
  try {
    const config = youtubeConfig();
    if (request.headers.get("origin") !== config.origin) return Response.json({ error: "Open YouTube connections from the configured ETA website." }, { status: 403 });
    if ((await request.formData()).get("policy") !== "agree") return Response.json({ error: "Accept the YouTube data policy before connecting." }, { status: 400 });
    const { admin, user } = await requireAccount();
    const existing = await connection(admin, user.id);
    if (existing?.status === "disconnecting") throw new Error("Disconnect pending");
    const { state, verifier, challenge } = oauthSecrets();
    const result = await admin.rpc("begin_social_oauth", { owner_id: user.id, state_digest: hash(state), encrypted_verifier: seal(verifier, `oauth:${user.id}`) });
    if (result.error) throw new Error("State unavailable");
    const response = NextResponse.redirect(authorizationUrl(state, challenge), 303);
    response.cookies.set("eta_youtube_state", state, { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/social/youtube", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return Response.json({ error: "YouTube connection could not start. Sign in and check the YouTube environment settings and migration." }, { status: 400 });
  }
}
