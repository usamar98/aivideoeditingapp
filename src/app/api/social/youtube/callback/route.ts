import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { youtubeConfig, YOUTUBE_SCOPE } from "@/lib/social/config";
import { channelForToken, exchangeCode } from "@/lib/social/youtube";
import { hash, seal, unseal } from "@/lib/social/crypto";
import { connection } from "@/lib/social/repository";

export async function GET(request: Request) {
  let origin: string;
  try { origin = youtubeConfig().origin; } catch { return Response.json({ error: "YouTube is not configured." }, { status: 503 }); }
  let outcome = "connection_failed";
  try {
    const params = new URL(request.url).searchParams, state = params.get("state"), browserState = (await cookies()).get("eta_youtube_state")?.value;
    if (!state || !browserState || state.length > 100 || hash(state) !== hash(browserState)) throw new Error("Invalid browser state");
    const { admin, user } = await requireAccount();
    // Claim once; retain the tombstone so disconnect can invalidate an in-flight exchange.
    const consumed = await admin.from("social_oauth_states").update({ consumed: true }).eq("consumed", false).eq("state_hash", hash(state)).eq("user_id", user.id).gt("expires_at", new Date().toISOString()).select("verifier").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("State expired or replayed");
    if (params.has("error")) { outcome = "denied"; throw new Error("Denied"); }
    const code = params.get("code"); if (!code || code.length > 4096) throw new Error("Missing code");
    const tokens = await exchangeCode(code, unseal(consumed.data.verifier, `oauth:${user.id}`));
    if (!tokens.refresh_token || !tokens.scope?.split(" ").includes(YOUTUBE_SCOPE)) { outcome = "permissions"; throw new Error("Missing scope or refresh token"); }
    const channel = await channelForToken(tokens.access_token), existing = await connection(admin, user.id);
    if (existing && (existing.channel_id !== channel.id || existing.status === "disconnecting")) { outcome = "different_channel"; throw new Error("Disconnect before changing channels"); }
    const saved = await admin.rpc("complete_social_oauth", { owner_id: user.id, state_digest: hash(state), channel: channel.id, title: channel.title,
      encrypted_token: seal(tokens.refresh_token, `youtube:${user.id}:${channel.id}`) });
    if (saved.error) throw new Error("Save failed");
    outcome = "connected";
  } catch { /* Never echo Google's callback parameters, tokens or raw errors. */ }
  const response = NextResponse.redirect(new URL(`/studio/social?youtube=${outcome}`, origin), 303);
  response.cookies.set("eta_youtube_state", "", { path: "/api/social/youtube", maxAge: 0, httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" });
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
