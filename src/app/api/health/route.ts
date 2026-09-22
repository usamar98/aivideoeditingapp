import { getIntegrationStatuses, isFixtureMode } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export function GET() {
  const integrations = getIntegrationStatuses();
  return Response.json(
    {
      status: integrations.every((item) => item.configured) ? "ready" : "degraded",
      fixtureMode: isFixtureMode(),
      integrations,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
