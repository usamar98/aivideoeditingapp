/** Presentation-only migration for older CMS content. Never rewrite stored
 * project data, billing IDs, model IDs or authentication credentials. */
const legacyTitles: Record<string, string> = {
  "AI Real Estate Video Generator from Listing Photos": "AI Real Estate Video Generator",
  "AI Cartoon Video Generator from Prompts & Images": "AI Cartoon Video Generator",
  "Faceless Video Generator — Script to Narrated Video": "Faceless Video Generator",
  "AI UGC Ad Generator — Product Images & Links to Video": "AI UGC & Product Ad Generator",
  "AI Short Film Generator — Story to Cinematic Video": "AI Short Film Generator",
  "AI Digital-Clone Presenter — Photo to Talking Video": "AI Talking Avatar & Presenter Generator",
  "AI Ad Remake — Reference Video to Product Ad": "AI Ad Remake & Video Editing",
  "Podcast to Shorts — AI Video Clipper & Captions": "Podcast to Shorts & AI Video Clipper",
};

export function rebrandPublicCopy(value: unknown): unknown {
  if (typeof value === "string") return legacyTitles[value] ?? value
    .replace(/(?:www\.)?editingapp\.live/gi, "createaivideos.app")
    .replace(/\b(?:ETA|Editing App|FrameFoundry)\b/g, "Create AI Videos")
    .replace(/Create AI Videos(?:’s|'s)/g, "Create AI Videos’");
  if (Array.isArray(value)) return value.map(rebrandPublicCopy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebrandPublicCopy(item)]));
  return value;
}

export function rebrandFeatureSeo(value: unknown): unknown {
  const updated = rebrandPublicCopy(value);
  if (!updated || typeof updated !== "object" || Array.isArray(updated)) return updated;
  const seo = updated as Record<string, unknown>;
  if (typeof seo.description === "string" && seo.description.length > 165) {
    seo.description = `${seo.description.slice(0, 161).replace(/\s+\S*$/, "").trimEnd()}…`;
  }
  return seo;
}
