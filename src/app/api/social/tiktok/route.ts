import { getTikTokDashboard } from "@/lib/social/tiktok-dashboard";

export async function GET() {
  try { return Response.json(await getTikTokDashboard(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Sign in again, or check TikTok publishing storage." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
