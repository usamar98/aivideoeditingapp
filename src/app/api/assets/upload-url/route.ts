import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "video/mp4", "text/vtt"] as const;
const extensions: Record<(typeof allowedMimeTypes)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "text/vtt": "vtt",
};

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(["reference", "storyboard", "audio", "video", "caption", "thumbnail", "export"]),
  mimeType: z.enum(allowedMimeTypes),
  byteSize: z.number().int().positive().max(500 * 1024 * 1024),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid upload request", issues: input.error.issues }, { status: 400 });
  const maxBytes = input.data.mimeType.startsWith("image/") ? 20 * 1024 * 1024 : input.data.mimeType.startsWith("audio/") ? 100 * 1024 * 1024 : 500 * 1024 * 1024;
  if (input.data.byteSize > maxBytes) return Response.json({ error: `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit for this media type.` }, { status: 413 });

  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Storage is unavailable" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { data: workspace } = await supabase.from("workspaces").select("id").eq("id", input.data.workspaceId).maybeSingle();
  if (!workspace) return Response.json({ error: "Workspace access denied" }, { status: 403 });

  const assetId = randomUUID();
  const path = `${input.data.workspaceId}/${userId}/${assetId}.${extensions[input.data.mimeType]}`;
  const { data: upload, error: uploadError } = await supabase.storage.from("private-media").createSignedUploadUrl(path);
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 502 });

  const { error: assetError } = await supabase.from("assets").insert({
    id: assetId,
    workspace_id: input.data.workspaceId,
    owner_id: userId,
    kind: input.data.kind,
    storage_bucket: "private-media",
    storage_path: path,
    mime_type: input.data.mimeType,
    byte_size: input.data.byteSize,
  });
  if (assetError) return Response.json({ error: assetError.message }, { status: 403 });

  return Response.json({ assetId, bucket: "private-media", path, token: upload.token });
}
