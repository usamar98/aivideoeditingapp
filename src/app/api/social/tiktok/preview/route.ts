import { requireAccount } from "@/lib/account";
import { sourceSchema } from "@/lib/social/types";
import { resolveVideo } from "@/lib/social/library";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const source = sourceSchema.parse({ kind: params.get("kind"), projectId: params.get("projectId"), outputKey: params.get("outputKey") || "" });
    const { admin, user } = await requireAccount(), video = await resolveVideo(admin, user.id, source);
    const result = await admin.storage.from("private-media").createSignedUrl(video.path, 600);
    if (result.error || !result.data?.signedUrl) throw new Error("Unavailable");
    return Response.json({ url: result.data.signedUrl }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return Response.json({ error: "Choose a completed video from your own account." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
