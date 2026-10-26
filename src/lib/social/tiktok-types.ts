import { z } from "zod";
import { sourceSchema, type LibraryVideo, type VideoSource } from "./types";

export const tiktokPrivacySchema = z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);
export type TikTokPrivacy = z.infer<typeof tiktokPrivacySchema>;
export const tiktokCreatorSchema = z.object({
  creator_username: z.string().min(1).max(100), creator_nickname: z.string().min(1).max(200),
  privacy_level_options: z.array(tiktokPrivacySchema).min(1).max(4),
  comment_disabled: z.boolean(), duet_disabled: z.boolean(), stitch_disabled: z.boolean(),
  max_video_post_duration_sec: z.number().int().positive().max(3600),
});
export type TikTokCreator = z.infer<typeof tiktokCreatorSchema>;
export const tiktokPublishSchema = z.object({
  requestId: z.uuid(), source: sourceSchema, caption: z.string().trim().max(2200),
  privacy: tiktokPrivacySchema, allowComments: z.boolean(), allowDuet: z.boolean(), allowStitch: z.boolean(),
  commercialContent: z.boolean(), brandOrganic: z.boolean(), brandedContent: z.boolean(),
  syntheticMedia: z.boolean(), rightsConfirmed: z.literal(true), musicConfirmed: z.literal(true), brandedPolicyConfirmed: z.boolean(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (p.commercialContent !== (p.brandOrganic || p.brandedContent)) issue("Select at least one commercial disclosure, or turn commercial content off.");
  if (p.brandedContent && (!p.brandedPolicyConfirmed || p.privacy === "SELF_ONLY")) issue("Paid partnerships require branded-content agreement and cannot be private.");
  if (p.scheduledAt && (Date.parse(p.scheduledAt) < Date.now() + 15 * 60_000 || Date.parse(p.scheduledAt) > Date.now() + 90 * 86400_000)) issue("Schedule between 15 minutes and 90 days from now.");
});
export type TikTokPublishInput = z.infer<typeof tiktokPublishSchema>;
export function validateTikTokCreatorChoice(p: Pick<TikTokPublishInput, "privacy" | "allowComments" | "allowDuet" | "allowStitch">, creator: TikTokCreator, publicPosting: boolean) {
  if (!creator.privacy_level_options.includes(p.privacy)) throw new Error("TikTok privacy choices changed. Refresh and choose again.");
  if (!publicPosting && (p.privacy !== "SELF_ONLY" || creator.privacy_level_options.includes("PUBLIC_TO_EVERYONE"))) throw new Error("Until TikTok approves Direct Post, connect a private TikTok account and choose Only me.");
  if ((p.allowComments && creator.comment_disabled) || (p.allowDuet && creator.duet_disabled) || (p.allowStitch && creator.stitch_disabled)) throw new Error("TikTok interaction settings changed. Refresh and review your choices.");
}
export type TikTokStatus = "queued" | "scheduled" | "publishing" | "processing" | "published" | "cancelled" | "needs_attention";
export type TikTokConnection = {
  id: string; user_id: string; open_id: string; display_name: string; username: string; tokens: string;
  status: "connected" | "reconnect" | "disconnecting"; token_lease: string | null; token_lease_until: string | null;
};
export type TikTokPost = {
  id: string; user_id: string; connection_id: string; source_kind: VideoSource["kind"]; source_project_id: string; source_output_key: string; source_path: string;
  caption: string; privacy: TikTokPrivacy; allow_comments: boolean; allow_duet: boolean; allow_stitch: boolean;
  commercial_content: boolean; brand_organic: boolean; branded_content: boolean; synthetic_media: boolean; scheduled_at: string | null;
  status: TikTokStatus; publish_id: string | null; public_post_id: string | null; init_started_at: string | null;
  media_ticket_hash: string | null; media_expires_at: string | null;
  attempts: number; lease_token: string | null; lease_until: string | null; next_check_at: string; error_message: string | null; created_at: string; updated_at: string;
};
export type TikTokPostView = Pick<TikTokPost, "id" | "caption" | "privacy" | "status" | "scheduled_at" | "init_started_at" | "error_message" | "created_at"> & { tiktokUrl: string | null };
export type TikTokDashboardData = {
  demo: boolean; configured: boolean; publishingEnabled: boolean; publicPosting: boolean; error: string | null;
  connection: Pick<TikTokConnection, "display_name" | "username" | "status"> | null; creator: TikTokCreator | null; videos: LibraryVideo[]; posts: TikTokPostView[];
};
export function validateTikTokMedia(info: unknown) {
  const media = z.object({ format: z.object({ duration: z.coerce.number().finite() }), streams: z.array(z.object({
    codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional(),
    side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
  })) }).parse(info);
  const video = media.streams.find((s) => s.codec_type === "video");
  const [n, d] = (video?.avg_frame_rate || "0/1").split("/").map(Number), fps = n / d;
  // Conservative initial app profile, not TikTok's full set of supported formats.
  if (!video?.width || !video.height || video.width < 540 || video.height < 960 || Math.abs(video.width / video.height - 9 / 16) > 0.005 ||
    video.codec_name !== "h264" || !Number.isFinite(fps) || fps < 23 || fps > 60 || media.format.duration < 3 || media.format.duration > 60 ||
    video.side_data_list?.some((r) => (r.rotation || 0) % 360 !== 0) || media.streams.some((s) => s.codec_type === "audio" && s.codec_name !== "aac")) {
    throw new Error("Choose a 9:16 H.264 MP4, 3–60 seconds, at least 540×960, 23–60 fps, with AAC audio if present.");
  }
  return { duration: media.format.duration };
}
