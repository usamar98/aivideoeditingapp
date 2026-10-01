import { getFacebookDashboard } from "@/lib/social/facebook-dashboard";
export async function GET() {
  try { return Response.json(await getFacebookDashboard(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Sign in and check the Facebook publishing migration." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
