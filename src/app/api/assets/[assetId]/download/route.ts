import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ assetId: z.string().uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return Response.json({ error: "Invalid asset ID" }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Storage is unavailable" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { data: asset, error } = await supabase.from("assets").select("storage_bucket,storage_path,mime_type").eq("id", parsed.data.assetId).is("deleted_at", null).maybeSingle();
  if (error || !asset) return Response.json({ error: "Asset not found" }, { status: 404 });
  const { data: signed, error: signedError } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60);
  if (signedError) return Response.json({ error: "Could not create a download link" }, { status: 502 });
  return Response.json({ url: signed.signedUrl, expiresIn: 60, mimeType: asset.mime_type });
}
