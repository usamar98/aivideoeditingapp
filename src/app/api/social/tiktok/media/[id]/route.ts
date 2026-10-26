import { createAdminClient } from "@/lib/supabase/admin";
import { serveTikTokMedia } from "@/lib/social/tiktok-media";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = createAdminClient();
    if (!db) throw new Error("Unavailable");
    return await serveTikTokMedia(db, (await context.params).id, request);
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
}
export const HEAD = GET;
