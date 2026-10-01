import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { facebookConfig } from "./facebook-config";
import { facebookIdentityHash, parseFacebookSignedRequest } from "./facebook";

export async function handleFacebookRemoval(request: Request, deletion: boolean) {
  try {
    // Bound the streamed body too; Content-Length alone is not trustworthy.
    if (!request.body) throw new Error("Missing body");
    const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    try {
      for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > 16000) { await reader.cancel(); throw new Error("Too large"); } chunks.push(result.value); }
    } finally { reader.releaseLock(); }
    const signed = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get("signed_request");
    if (!signed) throw new Error("Missing signature");
    const remote = parseFacebookSignedRequest(signed), admin = createAdminClient();
    if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });
    const result = await admin.rpc("delete_facebook_data", { remote_user: remote.user_id, remote_hash: facebookIdentityHash(remote.user_id) });
    if (result.error || !result.data) return Response.json({ error: "Removal could not be completed. Please retry." }, { status: 503 });
    return Response.json(deletion ? { url: `${facebookConfig().origin}/api/social/facebook/deletion?code=${result.data}`, confirmation_code: result.data } : { success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Invalid signed request" }, { status: 400 }); }
}
