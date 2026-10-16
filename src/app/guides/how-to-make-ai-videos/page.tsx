import Link from "next/link";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { brand } from "@/config/brand";
import { articleMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, breadcrumbSchema, organizationId, pageSchema } from "@/lib/seo/structured-data";

const path = "/guides/how-to-make-ai-videos";
const title = "How to Make AI Videos";
const description = "Learn how to choose an AI video workflow, write a focused prompt, review your plan and credit costs, and check the finished video before publishing.";
const publishedAt = "2026-10-16";
const modifiedAt = "2026-10-16";
export const metadata = articleMetadata({ title, description, path, publishedAt, modifiedAt });

const workflows = [
  {
    title: "Faceless videos: let narration carry the idea", href: "/features/faceless-video-generator", link: "Explore the faceless video generator",
    text: "Choose this for a short explainer or narrated story without filming yourself. Start with a topic or your own script, review the scenes, then generate still images, narration and optional timed captions. This workflow does not generate full-motion footage for each scene.",
  },
  {
    title: "AI cartoons: put characters at the center", href: "/features/ai-cartoon-series", link: "Explore the AI cartoon studio",
    text: "Choose cartoons for a visual joke, fictional adventure or short character exchange. Reference-based models can use authorized character artwork and cast portraits. Direct-prompt models skip image generation. Review the story before animation, and expect possible variation in appearance, voices, exact dialogue and lip sync.",
  },
  {
    title: "Short films: plan connected cinematic shots", href: "/features/ai-short-film-generator", link: "Explore the AI short film generator",
    text: "Use the film workflow when your story needs an approved cast and a sequence of cinematic shots. Review the written storyboard, actions and camera directions before rendering. Reused references and continuity instructions guide the result, but do not guarantee identical characters or perfect continuity.",
  },
  {
    title: "UGC-style ads: present a product clearly", href: "/features/ai-ugc-product-ads", link: "Explore AI UGC and product ads",
    text: "Start with product images or an accessible public product page. Review imported facts, a fictional presenter and three opening hooks. Original product photos appear in a composed layout; the presenter does not physically demonstrate the item. Synthetic presenters must not be portrayed as genuine customer testimonials.",
  },
  {
    title: "Talking presenters: animate an authorized portrait", href: "/features/ai-digital-clone-presenter", link: "Explore the talking presenter generator",
    text: "Use your own adult likeness, or a portrait and exact script explicitly authorized by the person shown. The tool animates the photo with a configured studio voice and optional captions. It is not personal voice cloning, identity verification or a trained custom avatar.",
  },
  {
    title: "Podcast Shorts: reuse recorded conversations", href: "/features/podcast-to-shorts", link: "Explore podcast and video clipping",
    text: "Upload a supported video recording with spoken audio to find possible highlights. Review clip boundaries, transcript corrections, captions and speaker framing before exporting. This workflow reuses original footage and voices rather than generating a new performance. Audio-only podcasts and source-link imports are not supported.",
  },
  {
    title: "Real estate videos: begin with actual property photos", href: "/features/ai-real-estate-video-generator", link: "Explore the real estate video generator",
    text: "Arrange listing photos by room, choose faithful photo motion or AI motion, and add branding and optional narration. Check every property fact. AI motion can change architecture or objects, so compare each generated room with its source. This is not virtual staging or a continuous 3D walkthrough.",
  },
  {
    title: "Ad Remake: adapt footage you may reuse", href: "/features/ai-ad-remake", link: "Explore AI Ad Remake",
    text: "Upload an authorized short reference ad and product images, then describe the intended changes. Review the generated edit against the original. Permission must cover footage, product assets, likenesses and any retained audio. This is not a way to copy another brand’s advertisement without authorization.",
  },
];

const steps = [
  {
    title: "Define one outcome and choose the format",
    text: "Decide what a viewer should understand, feel or do. Then choose the workflow, duration and orientation that serve that outcome. A vertical social clip and a landscape property tour need different framing. Check the tool’s supported inputs before preparing assets; not every workflow accepts image references, source links or the same video formats.",
  },
  {
    title: "Describe what is said separately from what is seen",
    text: "For narration, write the message in short sentences and describe a matching visual for each scene. For animation, name the character, setting, action and reaction. Keep one main action per short shot. Separate exact dialogue from camera directions so the plan is easy to review. Avoid cramming several locations or long speeches into one scene.",
  },
  {
    title: "Review the plan before approving rendering",
    text: "Read the storyboard or script, correct unsupported claims and inspect available cast or presenter previews. Check the cost of this stage and the later render separately. A written storyboard is not a finished video preview: some scene images are generated during rendering. Confirm the right model options and output format before starting paid work.",
  },
  {
    title: "Track the job and inspect the finished file",
    text: "Use Jobs to follow background progress and return to the saved project when it finishes. A cancellation request may need worker confirmation before credits are released. Watch the complete result rather than judging its thumbnail. Another render is a new paid job, so identify the specific change you want before submitting again.",
  },
];

export default function HowToMakeAiVideosPage() {
  const articleId = absoluteUrl(`${path}#article`);
  return <MarketingPage title="How to make AI videos, from idea to reviewed export." description="Choose the workflow that matches your source material, write a focused brief, review the plan and credit estimate, then check the finished video before sharing. AI can handle production steps, but creative judgment and factual review remain yours." eyebrow="Create AI Videos guide">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", "@id": articleId, headline: title, description, url: absoluteUrl(path), mainEntityOfPage: absoluteUrl(`${path}#webpage`), image: absoluteUrl("/opengraph-image"), author: { "@type": "Organization", "@id": organizationId, name: brand.name, url: absoluteUrl("/about") }, publisher: { "@id": organizationId }, datePublished: publishedAt, dateModified: modifiedAt, inLanguage: "en" }} />
    <JsonLd data={{ ...pageSchema(path, title, description), mainEntity: { "@id": articleId }, datePublished: publishedAt, dateModified: modifiedAt }} />
    <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: title, path }])} />
    <p className="text-sm text-muted-foreground">By <Link href="/about" className="underline underline-offset-4">{brand.name}</Link> · Updated <time dateTime={modifiedAt}>October 16, 2026</time> · Based on the supported workflows in this studio</p>

    <section aria-labelledby="choose-workflow">
      <h2 id="choose-workflow" className="editorial text-3xl">First, choose what you are making</h2>
      <p className="mt-4 max-w-3xl leading-8 text-muted-foreground">“AI video” covers different production methods. Some tools create moving scenes; others animate a photo, assemble narrated images or edit footage you already recorded. Start with the output you need, not just the name of an AI model.</p>
      <div className="mt-7 grid gap-6 md:grid-cols-2">{workflows.map((workflow) => <section key={workflow.href} className="rounded-2xl border border-border bg-card p-6"><h3 className="text-lg font-semibold">{workflow.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{workflow.text}</p><Link href={workflow.href} className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">{workflow.link}</Link></section>)}</div>
      <p className="mt-5 text-sm leading-7">Choosing between narration and animation? Read the <Link href="/guides/faceless-videos-vs-ai-cartoons" className="text-primary underline underline-offset-4">faceless video versus AI cartoon comparison</Link>.</p>
    </section>

    <section aria-labelledby="creation-steps"><h2 id="creation-steps" className="editorial text-3xl">A practical four-step creation process</h2><ol className="mt-6 space-y-7">{steps.map((step, index) => <li key={step.title} className="flex gap-4"><span aria-hidden="true" className="mt-1 font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</span><div className="max-w-3xl"><h3 className="text-lg font-semibold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{step.text}</p></div></li>)}</ol></section>

    <section aria-labelledby="prompt-examples"><h2 id="prompt-examples" className="editorial text-3xl">Two focused briefs you can adapt</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><div className="rounded-xl border border-border p-6"><h3 className="font-semibold">Narrated explainer</h3><blockquote className="mt-3 text-sm leading-7 text-muted-foreground">Create a 30-second vertical video for beginner gardeners about checking soil before watering. Use three watercolor-style scenes: a potted plant, a close-up of the soil, and a watering can. Use calm English narration and readable captions. End with one practical reminder. Flag any uncertain advice for review.</blockquote></div><div className="rounded-xl border border-border p-6"><h3 className="font-semibold">Character-led cartoon</h3><blockquote className="mt-3 text-sm leading-7 text-muted-foreground">Create a 15-second cartoon in one sunny workshop. A curious orange cat taps a small blue robot. The robot wakes up and says, “Ready for an adventure?” The cat jumps back, then smiles. Use a hand-drawn style and simple camera movement. Keep the character descriptions consistent across the scene plan.</blockquote></div></div><p className="mt-3 text-xs leading-6 text-muted-foreground">These are illustrative prompts, not tested outputs or promises that every requested detail will appear exactly.</p></section>

    <section aria-labelledby="costs-and-review"><h2 id="costs-and-review" className="editorial text-3xl">Check costs, permissions and output quality</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Planning is not universally free. AI script writing, cast creation, presenter preparation or recording analysis can have a separate charge before rendering. Successfully completed planning remains charged if you decide not to continue. Render costs depend on the workflow and selected options. Read the estimate before each confirmation and see <Link href="/pricing" className="text-primary underline underline-offset-4">plans and credit details</Link>.</p><ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-7 text-muted-foreground"><li>Verify factual claims, prices, property details and spoken names.</li><li>Check character drift, product packaging, altered architecture and lip sync.</li><li>Listen to the audio and inspect captions and framing on a phone screen.</li><li>Confirm permission for reference media, likenesses, music and intended use.</li><li>Keep required AI disclosures and avoid presenting synthetic speech as a real endorsement.</li></ul><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Submitted creative inputs are processed by relevant providers. Do not upload secrets or material you lack permission to share. Private downloads and signed links should not be shared unintentionally. Read the <Link href="/privacy" className="text-primary underline underline-offset-4">privacy information</Link> before submitting sensitive material.</p></section>

    <section aria-labelledby="publish-video"><h2 id="publish-video" className="editorial text-3xl">Publish only after your final review</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Download the completed file or use an available, separately authorized publishing connection. Facebook Page and YouTube publishing require explicit confirmation and depend on platform approvals and deployment settings. Check the destination, audience, disclosure and timing; generating a video is not permission to publish it automatically. No workflow guarantees views, advertising results or search rankings. For a blocked job, use <Link href="/contact" className="text-primary underline underline-offset-4">support</Link> with the job ID, not your password or API keys.</p></section>
  </MarketingPage>;
}
