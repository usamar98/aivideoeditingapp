import { formatUsd, planTerms, pricingTiers } from "@/lib/billing/pricing";
import { CARTOON_PLAN_CREDITS, cartoonModels, cartoonRenderCredits } from "@/lib/cartoons/schema";

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
    answer: "ETA has two video workflows. The faceless video generator combines AI still images, narration and optional timed captions. The cartoon studio creates character-led animation from a prompt or uploaded character art, with an editable story and generated dialogue. Both workflows export a private MP4.",
  },
  {
    question: "What is the difference between faceless videos and cartoons?",
    answer: "Choose faceless video for a narrated explainer or short story without an on-camera presenter. Choose cartoons when characters need to move, interact and speak. Faceless scenes use still images; cartoon scenes use generated animation. The workflows have different credit costs and controls.",
  },
  {
    question: "Can I review my video before paying for the final render?",
    answer: `Yes. Review and edit the storyboard before starting the separate rendering stage. Faceless AI script writing costs 2 credits, or use your own script without that writing charge. Cartoon cast and story creation costs ${CARTOON_PLAN_CREDITS} credits. These completed planning stages remain charged even if you choose not to render.`,
  },
  {
    question: "How much does ETA cost?",
    answer: `Monthly plans start at ${formatUsd(starter.monthlyAmount)} for ${starter.monthlyCredits.toLocaleString("en-US")} credits. Starter yearly billing is ${formatUsd(starterAnnual.amount)} upfront, equivalent to ${formatUsd(starterAnnual.monthlyEquivalent)} per month, with ${starterAnnual.credits.toLocaleString("en-US")} credits issued upfront. Faceless rendering costs 20 credits; cartoon costs depend on length and model. Prices are in USD; any applicable taxes are shown at checkout.`,
  },
  {
    question: "Can I use my own cartoon character images?",
    answer: "Yes. Add up to three character references, with one clear character per image. PNG, JPG and WebP files up to 8 MB each are supported. You must have permission to use the references. AI adapts the images into cast portraits, but appearance and voice consistency can vary.",
  },
  {
    question: "Which video formats and languages are supported?",
    answer: "Both workflows support vertical 9:16 and landscape 16:9 MP4 files. Faceless videos target 30 or 60 seconds with English, Spanish or French narration. Cartoons offer 15, 30 or 60 seconds at 720p with English generated speech. Review pronunciation and dialogue before sharing.",
  },
  { question: "Can I cancel a running generation?", answer: cancellationAnswer },
  {
    question: "Does ETA post videos to my social accounts?",
    answer: "No. Download and review the finished MP4, then upload it to your chosen platform yourself. ETA does not currently schedule posts or publish to social accounts. AI output can contain errors; check facts, character details, dialogue and usage permissions before publishing.",
  },
];

export const featureEditorial: Record<string, FeatureEditorial> = {
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
    updatedAt: "2026-09-25",
    summary: "ETA’s AI cartoon studio creates a short animated film from a story prompt or your own character artwork. AI prepares up to three characters and an editable scene plan with actions, camera directions and dialogue. Review the cast portraits and text storyboard first, then approve animation separately. Reused character references guide the film, but exact appearance, spoken words and cross-scene voice consistency are not guaranteed.",
    steps: [
      {
        title: "Describe a small, clear story",
        text: "Name the characters, setting, problem and ending. Choose 15, 30 or 60 seconds and a vertical or landscape canvas. Pick Cinematic 3D, Hand-drawn 2D, Anime or Clay animation as art direction. A focused adventure with a few actions is easier to review than a crowded list of events.",
      },
      {
        title: "Add references and approve cast creation",
        text: "Optionally upload one clear image for each of up to three characters and give each a name. Use artwork you have permission to submit. Confirm the cast-and-story credit cost, then review the generated portraits and text scenes. The review screen is not a set of finished animated scene previews.",
      },
      {
        title: "Refine the actions and spoken lines",
        text: "Edit scene actions, settings, camera directions, sound and dialogue. Keep conversations brief: each scene supports up to two dialogue lines and at most two spoken words per second. The approved cast is locked during story editing; start a new project if you want to redesign the characters.",
      },
      {
        title: "Animate, review and download",
        text: "Confirm the separate animation cost. ETA reuses character references while generating scenes, preserves their generated audio and joins them into an MP4. Follow progress in Jobs and return when it finishes. Watch the complete film for visual drift, pronunciation and lip sync before you publish it elsewhere.",
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
        answer: `Cast and story creation costs ${CARTOON_PLAN_CREDITS} credits. ${cartoonModels["kling-o3"].name} animation costs ${cartoonModels["kling-o3"].creditsPerSecond} credits per second, so a 15-second film uses ${klingShortCredits} animation credits, or ${CARTOON_PLAN_CREDITS + klingShortCredits} with a new cast and story. ${cartoonModels["seedance-2.5"].name}, when enabled, costs ${cartoonModels["seedance-2.5"].creditsPerSecond} animation credits per second.`,
      },
      {
        question: "Which images can I upload for a character?",
        answer: "Upload up to three PNG, JPG or WebP images, no more than 8 MB each. Use one clear character per image and name it in the studio. Prompts and submitted reference images are sent to AI providers to create the film.",
      },
      {
        question: "Does the finished cartoon include speech and captions?",
        answer: "Cartoon scenes use generated English dialogue and sound. Exact words, pronunciation, lip sync and voice continuity can vary. Automatic subtitles are not included in this workflow. Watch and listen to the result before sharing it.",
      },
      {
        question: "Can I export a 3D character or regenerate one scene?",
        answer: "No. The download is a finished 720p MP4, not an editable 3D model or animation rig. Individual-scene regeneration, voice cloning and a reusable cross-project character library are not included. Rendering the film again is another paid job.",
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
  { label: "Visual output", faceless: "Narrated scenes made from AI still images", cartoons: "Generated character animation guided by cast references" },
  { label: "Length options", faceless: "Approximately 30 or 60 seconds", cartoons: "15, 30 or 60 seconds" },
  { label: "Language", faceless: "English, Spanish or French narration", cartoons: "English generated dialogue" },
  { label: "Captions", faceless: "Optional captions burned into the MP4", cartoons: "No automatic subtitles in this workflow" },
  { label: "Review before rendering", faceless: "Editable narration and visual prompts", cartoons: "Cast portraits and editable actions, camera directions and dialogue" },
  { label: "Generation credits", faceless: "20 to render; 2 more for AI script writing", cartoons: `${CARTOON_PLAN_CREDITS} for cast and story; animation from ${cartoonModels["kling-o3"].creditsPerSecond} credits per second` },
  { label: "Download", faceless: "Private 720p MP4 in 9:16 or 16:9", cartoons: "Private 720p MP4 in 9:16 or 16:9" },
];
