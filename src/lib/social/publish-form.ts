export type UploadRequirement = { id: string; message: string };

/** Client-side guidance only. The server still validates every upload request. */
export function missingUploadRequirements(input: {
  hasVideo: boolean;
  title: string;
  kids: string;
  synthetic: string;
  consent: boolean;
  mode: string;
  scheduled: string;
}): UploadRequirement[] {
  const missing: UploadRequirement[] = [];
  if (!input.hasVideo) missing.push({ id: "youtube-video", message: "Choose a completed video." });
  if (!input.title.trim()) missing.push({ id: "youtube-title", message: "Enter a YouTube title." });
  if (input.mode === "schedule" && (!input.scheduled || !Number.isFinite(new Date(input.scheduled).getTime()))) {
    missing.push({ id: "youtube-scheduled", message: "Choose a valid publication date and time." });
  }
  if (!["yes", "no"].includes(input.kids)) missing.push({ id: "youtube-kids", message: "Choose whether this video is made for kids." });
  if (!["yes", "no"].includes(input.synthetic)) {
    missing.push({ id: "youtube-synthetic", message: "Choose Yes or No for realistic altered / AI-generated content." });
  }
  if (!input.consent) missing.push({ id: "youtube-consent", message: "Confirm your rights and permission to upload." });
  return missing;
}
