import { getSocialDashboard } from "@/lib/social/dashboard";
export async function GET() {
  try { return Response.json(await getSocialDashboard(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Could not load YouTube. Check your sign-in and the publishing migration." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
