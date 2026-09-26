import { z } from "zod";

export const sourceSchema = z.object({ kind: z.enum(["faceless", "cartoon", "ugc", "shorts"]), projectId: z.uuid(), outputKey: z.string().max(80).regex(/^[\w-]*$/).default("") });
export type VideoSource = z.infer<typeof sourceSchema>;
export type LibraryVideo = VideoSource & { title: string; href: string };
export const publishSchema = z.object({
  requestId: z.uuid(), source: sourceSchema,
  title: z.string().min(1).max(100).refine((s) => Boolean(s.trim()) && !/[<>]/.test(s), "Enter a title without < or >."),
  description: z.string().max(5000).refine((s) => new TextEncoder().encode(s).length <= 5000, "Description exceeds YouTube’s 5,000-byte limit."),
  visibility: z.enum(["private", "unlisted", "public"]),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  madeForKids: z.boolean(), syntheticMedia: z.boolean(), rightsConfirmed: z.literal(true),
}).superRefine((p, ctx) => {
  if (p.scheduledAt && (p.visibility !== "public" || Date.parse(p.scheduledAt) < Date.now() + 15 * 60_000 || Date.parse(p.scheduledAt) > Date.now() + 90 * 86400_000)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Schedule a public video between 15 minutes and 90 days from now." });
  }
});
export type PublishInput = z.infer<typeof publishSchema>;
export type PostStatus = "queued" | "uploading" | "processing" | "scheduled" | "published" | "private" | "cancelled" | "failed" | "needs_attention" | "cancelling";
export type SocialPost = {
  id: string; user_id: string; connection_id: string; source_kind: VideoSource["kind"]; source_project_id: string; source_output_key: string; source_path: string;
  title: string; description: string; visibility: "private" | "unlisted" | "public"; scheduled_at: string | null;
  made_for_kids: boolean; synthetic_media: boolean; status: PostStatus; cancel_requested: boolean;
  youtube_video_id: string | null; remote_privacy: string | null; remote_publish_at: string | null; visibility_applied: boolean;
  upload_session: string | null; total_bytes: number | null; uploaded_bytes: number; attempts: number;
  lease_token: string | null; lease_until: string | null; next_check_at: string; error_message: string | null; created_at: string; updated_at: string;
};
export type SocialConnection = { id: string; user_id: string; channel_id: string; channel_title: string; refresh_token: string; status: "connected" | "reconnect" | "disconnecting"; created_at: string; revoked_at: string | null };
export type PostView = Pick<SocialPost, "id" | "title" | "status" | "visibility" | "scheduled_at" | "remote_privacy" | "remote_publish_at" | "cancel_requested" | "error_message" | "created_at" | "updated_at" | "uploaded_bytes" | "total_bytes"> & { youtubeUrl: string | null };
export type SocialDashboard = { configured: boolean; publicPublishing: boolean; demo: boolean; error: string | null; connection: Pick<SocialConnection, "channel_id" | "channel_title" | "status"> | null; videos: LibraryVideo[]; posts: PostView[] };
