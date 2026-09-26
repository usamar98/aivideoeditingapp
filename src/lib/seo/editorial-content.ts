import { formatUsd, planTerms, pricingTiers } from "@/lib/billing/pricing";
import { CARTOON_PLAN_CREDITS, cartoonModels, cartoonRenderCredits } from "@/lib/cartoons/schema";
import { UGC_PLAN_CREDITS, ugcRenderCredits } from "@/lib/ugc/schema";
import { shortsEditorial } from "@/lib/shorts/editorial";

export type Answer = { question: string; answer: string };

type FeatureEditorial = {
  summary: string;
  steps: { title: string; text: string }[];
  useCases: { title: string; text: string }[];
  faqs: Answer[];
  updatedAt: string;
};

const starter = pricingTiers.find((tier) => tier.id === "starter")!;
const starterAnnual = planTerms(starter, "year");
const klingShortCredits = cartoonRenderCredits({ model: "kling-o3", duration: 15 });
const cancellationAnswer = "Open Jobs to view waiting, running, completed, failed and cancelled work. You can request cancellation from an active job. A job that has not started can release its reserved credits immediately; a running job releases them after the worker stops. Provider work already in progress may not stop instantly.";

export const homeFaqs: Answer[] = [
  {
    question: "What can I create with ETA?",
    answer: "ETA has four video workflows: narrated faceless videos, character-led AI cartoons, AI UGC product ads, and podcast-to-Shorts editing. Shorts repurpose your recordings into selected highlights with framing controls and animated captions. All workflows have a review step before rendering and export private MP4 files.",
  },
  {
    question: "What is the difference between faceless videos and cartoons?",
    answer: "Choose faceless video for a narrated explainer or short story without an on-camera presenter. Choose cartoons when characters need to move, interact and speak. Faceless scenes use still images; cartoon scenes use generated animation. The workflows have different credit costs and controls.",
  },
  {
    question: "Can I review my video before paying for the final render?",
    answer: `Yes. Review and edit the plan before starting the separate rendering stage. Faceless AI script writing costs 2 credits, or use your own script without that writing charge. Cartoon reference-mode cast and story creation costs ${CARTOON_PLAN_CREDITS} credits; direct-prompt story planning costs 2 credits. UGC presenter and hook planning costs ${UGC_PLAN_CREDITS} credits. Completed planning stages remain charged even if you choose not to render.`,
  },
  {
    question: "How much does ETA cost?",
    answer: `Monthly plans start at ${formatUsd(starter.monthlyAmount)} for ${starter.monthlyCredits.toLocaleString("en-US")} credits. Starter yearly billing is ${formatUsd(starterAnnual.amount)} upfront, equivalent to ${formatUsd(starterAnnual.monthlyEquivalent)} per month, with ${starterAnnual.credits.toLocaleString("en-US")} credits issued upfront. Faceless rendering costs 20 credits; cartoon costs depend on length and model. Prices are in USD; any applicable taxes are shown at checkout.`,
  },
  {
    question: "Can I use my own cartoon character images?",
    answer: "Yes, with a character-reference model. Add up to three character references, with one clear character per image. PNG, JPG and WebP files up to 8 MB each are supported. You must have permission to use the references. AI adapts the images into cast portraits, but appearance and voice consistency can vary.",
  },
  {
    question: "Which video formats and languages are supported?",
    answer: "Faceless videos and cartoons support vertical and landscape MP4 files; UGC ads also offer square exports. Podcast Shorts export 15–60 second clips in vertical 720 × 1280 with original audio and optional captions. Language support and generation lengths differ by tool; check the relevant feature page and review the result before sharing.",
  },
  { question: "Can I cancel a running generation?", answer: cancellationAnswer },
  {
    question: "Does ETA post videos to my social accounts?",
    answer: "No. Download and review the finished MP4, then upload it to your chosen platform yourself. ETA does not currently schedule posts or publish to social accounts. AI output can contain errors; check facts, character details, dialogue and usage permissions before publishing.",
  },
];

export const featureEditorial: Record<string, FeatureEditorial> = {
  "podcast-to-shorts": shortsEditorial,
  "ai-ugc-product-ads": {
    updatedAt: "2026-09-25",
    summary: "ETA’s AI UGC ad generator combines a fictional talking presenter with your actual product photos. Start from a public product page or upload the images yourself. Review the imported facts, define your audience and approved benefits, then create a presenter and three hook options. Edit the shared script and choose which variants to render. Product photos remain separate from generated footage to preserve the original packaging and appearance. This is a guided ad-creation workflow, not a real customer testimonial service or an ad-buying platform.",
    steps: [
      { title: "Add the product and verify its facts", text: "Import a public HTTPS product page or upload one to four PNG, JPG or WebP photos up to 8 MB each. Page metadata can be incomplete or wrong, so review the name, description and images. Add your intended audience, supported benefits, optional offer and call to action. If a store blocks imports, use manual photos and details instead." },
      { title: "Choose a presenter and create three hooks", text: "Choose a warm, confident, upbeat or calm presenter direction. ETA generates a new fictional adult portrait and writes a shared body and CTA with three different opening lines. The English narration uses the studio’s configured voice. The presenter is not a celebrity, a cloned customer or a real person claiming to have used your product." },
      { title: "Edit and approve your selected variants", text: "Review the presenter, correct every product claim, and edit the hook and body copy. Keep each complete script within the displayed word limit. Select one, two or all three openings. You see the exact reserved-credit cost before rendering; saving a brief does not start paid generation." },
      { title: "Download, review and test your ads", text: "Kling AI Avatar v2 Pro animates the presenter from the approved narration. ETA combines that clip with original product photos, a brand-color accent, an on-screen CTA and optional burned-in captions. Download the MP4 and separate SRT captions from the private project. Watch every version before uploading it to your advertising platform, and judge performance using your own campaign data." },
    ],
    useCases: [
      { title: "A product launch with several openings", text: "Introduce one product to a defined audience. Compare a question-led hook with a benefit-led hook while keeping the presenter, core message and CTA consistent. Changing fewer creative elements can make the differences easier to interpret in your own tests." },
      { title: "Existing product photos, a new presentation", text: "Reuse approved catalogue images in a presenter-led composition. Original images appear beside or below the presenter and cycle through the ad; ETA does not redraw labels or pretend the presenter is physically handling the product." },
      { title: "A concise paid-social creative", text: "Choose a 15- or 30-second ad in 9:16, 1:1 or 16:9. Use short, substantiated copy and readable captions. Exports include a visible AI-presenter label. Platform review, required disclosures and final publishing remain your responsibility." },
    ],
    faqs: [
      { question: "What is an AI UGC ad?", answer: "An AI UGC ad is an advertisement styled like creator-led content but made using an AI presenter. It is not authentic user-generated testimony. ETA generates a fictional adult spokesperson and labels the video as featuring an AI presenter. Do not imply that this spokesperson bought, tested or personally recommends the product." },
      { question: "Can I turn a product link into a video ad?", answer: "Yes, for accessible public HTTPS pages. ETA imports available product metadata and supported photos, which you review before generation. It does not bypass logins, anti-bot protection or paywalls. If a page needs JavaScript or does not expose suitable images, upload photos and enter the product details yourself." },
      { question: "How many hooks and ad variants can I create?", answer: "Each planning stage produces three editable opening hooks with a shared body and CTA. Render one, two or all three selected hooks. You can edit the plan and render again as a new paid job. Existing exports retain the script used when they were generated." },
      { question: "How much do UGC ads cost in credits?", answer: `Presenter and three-hook planning costs ${UGC_PLAN_CREDITS} credits. Each 15-second ad costs ${ugcRenderCredits(15, 1)} credits, and each 30-second ad costs ${ugcRenderCredits(30, 1)} credits. A new plan plus three 15-second variants costs ${UGC_PLAN_CREDITS + ugcRenderCredits(15, 3)} credits. Failed or confirmed cancelled jobs refund their own reservation; completed planning stays charged.` },
      { question: "Which model, voice and export formats does ETA use?", answer: "Presenter animation uses Kling AI Avatar v2 Pro on fal. Planning uses Gemini through fal and portrait generation uses GPT Image 2.5 Sunburst. English narration uses the configured ElevenLabs studio voice. Export 15- or 30-second MP4s at 720×1280, 720×720 or 1280×720, with separate timed SRT files and optional burned-in captions." },
      { question: "Will the AI presenter hold or demonstrate my product?", answer: "Not in this workflow. The original product photos are composed beside or below the talking presenter. This preserves your imagery without promising accurate AI-generated packaging, hand interactions or unboxing footage. Describe only functions or benefits you can substantiate." },
      { question: "Can ETA publish the ads or guarantee conversions?", answer: "No. ETA creates downloadable assets; it does not connect ad accounts, buy media, publish automatically or guarantee approvals, clicks or sales. Review claims, rights, AI disclosure and platform requirements before publishing." },
      { question: "Can I cancel an ad job?", answer: cancellationAnswer },
    ],
  },
  "faceless-video-generator": {
    updatedAt: "2026-09-25",
    summary: "ETA’s faceless video generator turns an idea or your own script into a narrated short without filming yourself. It creates AI still images for each scene, adds voiceover and optional timed captions, and assembles a downloadable MP4. You review the narration and visual prompts before rendering. This is a guided scene-based workflow, not a stock-footage editor or a moving-video generation model.",
    steps: [
      {
        title: "Choose an idea or bring a script",
        text: "Describe one topic and the point you want viewers to remember. Choose an approximately 30- or 60-second format, vertical or landscape framing, a visual style and a narration language. If you already have a script, paste it to divide your words into scenes without an AI rewrite.",
      },
      {
        title: "Review the narration and visual plan",
        text: "Read each scene aloud and remove details that make the story hard to follow. Edit the image prompts to describe a clear subject, setting and mood. Keep the complete narration under 80 words for the 30-second option or 155 words for the 60-second option. Check factual claims yourself.",
      },
      {
        title: "Confirm the render and follow progress",
        text: "Start rendering only when the storyboard is ready. ETA generates the scene images and narration, then assembles the video with captions if selected. Jobs run in the background, so you can leave the page and return. Queue time and provider availability affect how long a generation takes.",
      },
      {
        title: "Watch the result before sharing",
        text: "Review image details, narration, pacing and caption readability in the finished MP4. Download it from your project and upload it yourself. Rendering an edited project is a new generation with another credit charge; there is no promise of a particular audience, view count or social-platform result.",
      },
    ],
    useCases: [
      {
        title: "A focused educational explainer",
        text: "Explain one idea with a clear opening, two or three supporting points and a short conclusion. Supply checked facts in your script rather than treating an AI draft as a researched source.",
      },
      {
        title: "A narrated fictional short",
        text: "Build a small story around one event or discovery. Describe the setting in each visual prompt so the sequence feels connected, while remembering that separate AI images may vary.",
      },
      {
        title: "A vertical social video",
        text: "Choose 9:16 for a Shorts- or Reels-style layout. Keep each scene focused on one message and enable captions when useful. Publishing, music selection and social scheduling happen outside ETA.",
      },
    ],
    faqs: [
      {
        question: "Does this generate moving footage or use still images?",
        answer: "Faceless videos use AI-generated still images assembled into narrated scenes. They do not include generative moving footage, an avatar, a stock library or background music. Use the cartoon workflow if your story needs animated character actions.",
      },
      {
        question: "How many credits does a faceless video use?",
        answer: "Rendering costs 20 credits. Asking AI to write the storyboard costs 2 additional credits, making a new AI-written video 22 credits when both stages succeed. Pasting your own script avoids the writing charge. Another render uses additional credits.",
      },
      {
        question: "Which styles and languages can I choose?",
        answer: "Visual styles are Cinematic, Illustration and Watercolor. Narration supports English, Spanish and French, with Informative, Storytelling and Inspiring tone options. Voiceover uses the studio’s configured voice; this workflow does not offer custom voice cloning.",
      },
      {
        question: "Are captions included in the download?",
        answer: "Captions are optional. When enabled, their timing comes from the narration and they are burned into the MP4. They are not a separate editable subtitle track. Listen to the voice and check the captions before sharing the file.",
      },
      {
        question: "Are the 30- and 60-second lengths exact?",
        answer: "They are target lengths. The actual output follows the generated narration, so speaking pace and script length affect duration. Shorten dense scripts before rendering. The export is 720 × 1280 pixels vertically or 1280 × 720 pixels in landscape.",
      },
      { question: "What if I need to stop a faceless job?", answer: cancellationAnswer },
    ],
  },
  "ai-cartoon-series": {
    updatedAt: "2026-09-26",
    summary: "ETA’s AI cartoon studio creates a short animated film from a story prompt or your own character artwork. AI prepares up to three characters and an editable scene plan with actions, camera directions and dialogue. Choose character-reference animation to review portraits first, or a direct-prompt model that skips image generation. Review the text storyboard and approve animation separately. Exact appearance, spoken words and cross-scene voice consistency are not guaranteed.",
    steps: [
      {
        title: "Describe a small, clear story",
        text: "Name the characters, setting, problem and ending. Choose 15, 30 or 60 seconds and a vertical or landscape canvas. Pick Cinematic 3D, Hand-drawn 2D, Anime or Clay animation as art direction. A focused adventure with a few actions is easier to review than a crowded list of events.",
      },
      {
        title: "Choose your model and review the estimate",
        text: "Choose a model, its supported resolution and, for Kling V3 Pro, sound on or off. Reference models let you upload up to three authorized character images and generate cast portraits. Direct-prompt models skip images and create a text story for review. Each shows its story and animation credit costs before confirmation.",
      },
      {
        title: "Refine the actions and spoken lines",
        text: "Edit scene actions, settings, camera directions, sound and dialogue. Keep conversations brief: each scene supports up to two dialogue lines and at most two spoken words per second. The approved cast is locked during story editing; start a new project if you want to redesign the characters.",
      },
      {
        title: "Animate, review and download",
        text: "Confirm the separate animation cost. ETA generates scenes from character references or text descriptions, preserves audio when selected and joins them into an MP4. Follow progress in Jobs and return when it finishes. Watch the complete film for visual drift, pronunciation and lip sync before you publish it elsewhere.",
      },
    ],
    useCases: [
      {
        title: "An original character adventure",
        text: "Give a small cast one problem to solve. For example, two penguins can build a kitchen-utensil flying machine, attempt a launch and react to a pancake landing. This is a prompt idea, not a claimed output example.",
      },
      {
        title: "An illustrated concept with dialogue",
        text: "Turn a fictional conversation into a short lesson or explainer. Write the key idea plainly and review any factual statements yourself. Simple, short lines leave more room for visible actions and reactions.",
      },
      {
        title: "Animation from your character artwork",
        text: "Use your own mascot or drawing as a reference instead of describing everything from scratch. Keep one character clearly visible per upload. Reference guidance helps preserve recognizable details but does not ensure an exact reproduction.",
      },
    ],
    faqs: [
      {
        question: "How much does a cartoon cost in credits?",
        answer: `Direct-prompt story planning costs 2 credits, with animation priced by model, duration, resolution and supported audio choice. The estimate appears before each stage. Reference-mode cast and story creation costs ${CARTOON_PLAN_CREDITS} credits. ${cartoonModels["kling-o3"].name} animation costs ${cartoonModels["kling-o3"].creditsPerSecond} credits per second, so a 15-second film uses ${klingShortCredits} animation credits, or ${CARTOON_PLAN_CREDITS + klingShortCredits} with a new cast and story. ${cartoonModels["seedance-2.5"].name}, when enabled, costs ${cartoonModels["seedance-2.5"].creditsPerSecond} animation credits per second.`,
      },
      {
        question: "Which images can I upload for a character?",
        answer: "With a character-reference model, upload up to three PNG, JPG or WebP images, no more than 8 MB each. Use one clear character per image and name it in the studio. Prompts and submitted reference images are sent to AI providers to create the film.",
      },
      {
        question: "Does the finished cartoon include speech and captions?",
        answer: "Audio-enabled cartoon scenes use generated English dialogue and sound. Kling V3 Pro also offers silent output. Exact words, pronunciation, lip sync and voice continuity can vary. Automatic subtitles are not included in this workflow. Watch and listen to the result before sharing it.",
      },
      {
        question: "Can I export a 3D character or regenerate one scene?",
        answer: "No. The download is a finished MP4 at the selected model-supported export resolution, not an editable 3D model or animation rig. Individual-scene regeneration, voice cloning and a reusable cross-project character library are not included. Rendering the film again is another paid job.",
      },
      {
        question: "What happens to credits if animation fails or I cancel?",
        answer: "A failed or confirmed cancelled stage returns that stage’s reserved credits. A successfully completed cast-and-story stage remains charged if a later animation is cancelled. Running jobs release their reservation after the worker stops; a stop request may not halt provider work immediately.",
      },
    ],
  },
};

export const comparisonRows: { label: string; faceless: string; cartoons: string }[] = [
  { label: "Starting point", faceless: "A topic or your own narration script", cartoons: "A story prompt, optionally with up to three character images" },
  { label: "Visual output", faceless: "Narrated scenes made from AI still images", cartoons: "Character-reference or direct-prompt animation" },
  { label: "Length options", faceless: "Approximately 30 or 60 seconds", cartoons: "15, 30 or 60 seconds" },
  { label: "Language", faceless: "English, Spanish or French narration", cartoons: "English generated dialogue" },
  { label: "Captions", faceless: "Optional captions burned into the MP4", cartoons: "No automatic subtitles in this workflow" },
  { label: "Review before rendering", faceless: "Editable narration and visual prompts", cartoons: "Editable scene plan; portraits in character-reference mode" },
  { label: "Generation credits", faceless: "20 to render; 2 more for AI script writing", cartoons: "2 for direct-prompt story planning, or 40 for reference cast and story; animation varies by model and settings" },
  { label: "Download", faceless: "Private 720p MP4 in 9:16 or 16:9", cartoons: "Private MP4 in 9:16 or 16:9; model-dependent resolution" },
];
