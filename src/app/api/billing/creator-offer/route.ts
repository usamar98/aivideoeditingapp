import { creatorOffer, isCreatorOfferActive } from "@/lib/billing/creator-offer";

export const dynamic = "force-dynamic";

export function GET() {
  const now = Date.now();
  return Response.json({ id: creatorOffer.id, now, startsAt: creatorOffer.startsAt, endsAt: creatorOffer.endsAt, active: isCreatorOfferActive(now) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
