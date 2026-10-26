import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/account";
import { hash, seal } from "@/lib/social/crypto";
import { tiktokConfig } from "@/lib/social/tiktok-config";
import { exchangeTikTokCode, tiktokCreator, tiktokUser } from "@/lib/social/tiktok";

export async function GET(request: Request) {
  const reference = randomUUID();
  let origin: string;
  try { origin = tiktokConfig().origin; } catch { return Response.json({ error: "TikTok is not configured.", reference }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  let outcome = "connection_failed", stage = "validate_state";
  try {
    const params = new URL(request.url).searchParams, state = params.get("state"), browserState = (await cookies()).get("cav_tiktok_state")?.value;
    if (!state || !browserState || state.length > 100 || hash(state) !== hash(browserState)) throw new Error("Invalid state");
    stage = "authenticate";
    const { admin, user } = await requireAccount();
    stage = "consume_state";
    const consumed = await admin.from("tiktok_oauth_states").update({ consumed: true }).eq("user_id", user.id).eq("state_hash", hash(state)).eq("consumed", false).gt("expires_at", new Date().toISOString()).select("user_id").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("Expired state");
    stage = "authorization";
    if (params.has("error")) { outcome = "denied"; throw new Error("Denied"); }
    const code = params.get("code"); if (!code || code.length > 4096) throw new Error("Missing code");
    stage = "exchange_code";
    const tokens = await exchangeTikTokCode(code);
    stage = "verify_identity";
    const identity = await tiktokUser(tokens.accessToken);
    if (identity.open_id !== tokens.openId) throw new Error("Identity mismatch");
    const creator = await tiktokCreator(tokens.accessToken);
    stage = "save_connection";
    const saved = await admin.rpc("complete_tiktok_oauth", { owner_id: user.id, state_digest: hash(state), remote_user: tokens.openId,
      title: creator.creator_nickname, handle: creator.creator_username, encrypted_tokens: seal(JSON.stringify(tokens), `tiktok:${user.id}:${tokens.openId}`) });
    if (saved.error) throw new Error("Connection invalidated");
    outcome = "connected"; stage = "complete";
  } catch { /* Never echo callback parameters, tokens or raw provider errors. */ }
  const log = JSON.stringify({ event: "tiktok.oauth", reference, outcome, stage });
  if (outcome === "connected") console.info(log); else console.warn(log);
  const destination = new URL("/studio/social/tiktok", origin);
  destination.searchParams.set("tiktok", outcome);
  if (outcome === "connection_failed") destination.searchParams.set("tiktok_ref", reference);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set("cav_tiktok_state", "", { path: "/api/social/tiktok", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
