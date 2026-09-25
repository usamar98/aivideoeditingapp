import { getPublishedFeaturesData } from "@/lib/features/repository";
import { llmsDocument } from "@/lib/seo/llms";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(llmsDocument(await getPublishedFeaturesData()), { headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Cache-Control": "no-store",
  } });
}
