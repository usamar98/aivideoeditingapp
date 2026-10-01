import { z } from "zod";
import { sourceSchema, type LibraryVideo, type VideoSource } from "./types";

export const facebookPublishSchema = z.object({
  requestId: z.uuid(), source: sourceSchema,
  title: z.string().trim().min(1).max(100), description: z.string().trim().max(2000),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  syntheticMedia: z.boolean(), rightsConfirmed: z.literal(true),
}).superRefine((value, ctx) => {
  if (value.scheduledAt && (Date.parse(value.scheduledAt) < Date.now() + 15 * 60_000 || Date.parse(value.scheduledAt) > Date.now() + 90 * 86400_000)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Choose a time between 15 minutes and 90 days from now." });
  }
});
export type FacebookStatus = "queued" | "scheduled" | "uploading" | "processing" | "publishing" | "published" | "cancelled" | "needs_attention";
export type FacebookConnection = {
  id: string; user_id: string; facebook_user_id: string; page_id: string; page_name: string;
  user_token: string; page_token: string; status: "connected" | "reconnect" | "disconnecting";
};
export type FacebookPost = {
  id: string; user_id: string; connection_id: string; source_kind: VideoSource["kind"]; source_project_id: string; source_output_key: string; source_path: string;
  title: string; description: string; synthetic_media: boolean; scheduled_at: string | null; status: FacebookStatus;
  video_id: string | null; upload_started_at: string | null; finish_started_at: string | null;
  attempts: number; lease_token: string | null; lease_until: string | null; next_check_at: string;
  error_message: string | null; created_at: string; updated_at: string;
};
export type FacebookPostView = Pick<FacebookPost, "id" | "title" | "status" | "scheduled_at" | "error_message" | "created_at" | "finish_started_at"> & { facebookUrl: string | null };
export type FacebookDashboardData = {
  demo: boolean; configured: boolean; publishingEnabled: boolean; error: string | null;
  connection: Pick<FacebookConnection, "page_id" | "page_name" | "status"> | null;
  pages: { id: string; name: string }[]; videos: LibraryVideo[]; posts: FacebookPostView[];
};

// ETA's initial Reels workflow intentionally accepts a conservative format subset.
export function validateFacebookMedia(info: unknown) {
  const media = z.object({ format: z.object({ duration: z.coerce.number().finite() }), streams: z.array(z.object({
    codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional(),
    side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
  })) }).parse(info);
  const video = media.streams.find((stream) => stream.codec_type === "video");
  const [numerator, denominator] = (video?.avg_frame_rate || "0/1").split("/").map(Number);
  const fps = numerator / denominator;
  if (!video?.width || !video.height || video.width < 540 || video.height < 960 || Math.abs(video.width / video.height - 9 / 16) > 0.005
    || !Number.isFinite(fps) || fps < 23 || fps > 60 || video.codec_name !== "h264"
    || video.side_data_list?.some((data) => (data.rotation || 0) % 360 !== 0)
    || media.streams.some((stream) => stream.codec_type === "audio" && stream.codec_name !== "aac")
    || media.format.duration < 4 || media.format.duration > 60) {
    throw new Error("Choose a 9:16 H.264 MP4 Reel, 4–60 seconds, at least 540×960, 23–60 fps, with AAC audio if present. Re-export the video in this format first.");
  }
}
