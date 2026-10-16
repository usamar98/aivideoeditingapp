import { brand } from "@/config/brand";
import { canIndexFeature, type FeatureDefinition } from "@/lib/features/catalog";
import { publicPages } from "./site";
import { absoluteUrl } from "./structured-data";

/** Optional discovery document, not a ranking directive or access control. */
export function llmsDocument(features: FeatureDefinition[]) {
  const line = (value: string) => value.replace(/[\r\n\[\]<>]/g, " ");
  return [
    `# ${brand.name}`, "", `> ${brand.description}`, "",
    "Create AI Videos is an AI video creation web application. Public feature pages describe supported workflows, pricing and limitations. Private projects and account information are not public documentation.", "",
    "## Public pages", "",
    ...publicPages.filter((page) => page.path !== "/").map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`),
    "", "## Available workflows", "",
    ...features.filter(canIndexFeature).map((feature) => `- [${line(feature.name)}](${absoluteUrl(`/features/${feature.slug}`)}): ${line(feature.description)}`),
    "", "## Product boundaries", "",
    "- Faceless output combines AI still images, narration and optional timed captions. It is not generative moving footage.",
    "- Cartoon output is reference-guided character animation. Exact visual consistency, spoken words and lip sync are not guaranteed.",
    "- AI UGC ads combine a fictional disclosed AI presenter with original product photos, three editable hooks and captions. They are not real customer testimonials or hands-on product demonstrations.",
    "- Short films use an approved story, cast and connected shots; a longer export is not one uninterrupted native model generation. Character and voice continuity need human review.",
    "- Real estate videos start from actual listing photos with faithful photo motion or AI motion. AI can change property details; compare the output with originals. This is not a continuous 3D tour or virtual staging.",
    "- Ad Remake edits authorized reference footage with product images. Generated products, logos and text may vary; it does not bypass rights, disclosure or platform requirements.",
    "- Photo presenters animate an authorized adult portrait with a configured studio voice. They are not trained personal avatars or voice clones.",
    "- Podcast Shorts repurpose uploaded talking videos with transcript-based highlight selection, editable cuts and captions. Face-follow is assisted by user-selected speaker positions, not guaranteed active-speaker recognition. Video uploads only; no audio-only or link import.",
    "- Generation is credit-based. Pricing and feature pages explain separate planning and rendering charges.",
    "- Videos require human review. Optional Facebook Page Reels and YouTube publishing require separate account authorization and explicit user confirmation; availability depends on platform approval and deployment settings.",
    "- Page content is the source of product facts; this optional directory does not guarantee search ranking or AI citations.",
    "", `Support: ${brand.supportEmail}`, "",
  ].join("\n");
}
