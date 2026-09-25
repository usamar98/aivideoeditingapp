import Link from "next/link";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { publicMetadata } from "@/lib/seo/metadata";
import { pageSchema, absoluteUrl } from "@/lib/seo/structured-data";

const title = "AI Video Creation Guides — Workflows and Planning";
const description = "Plan your next ETA video. Compare faceless videos and AI cartoons, understand what each workflow generates and review your story before rendering.";
export const metadata = publicMetadata({ title, description, path: "/guides" });

export default function GuidesPage() {
  return <MarketingPage title="Choose the right workflow for your story." description="Practical guidance for working with ETA: understand the output, write a focused brief and review AI-generated details before sharing a finished video." eyebrow="ETA creation guides">
    <JsonLd data={{ ...pageSchema("/guides", title, description, "CollectionPage"), mainEntity: { "@type": "ItemList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Faceless videos vs AI cartoons", url: absoluteUrl("/guides/faceless-videos-vs-ai-cartoons") }] } }} />
    <article className="rounded-2xl border border-border bg-card p-7"><p className="eyebrow text-primary">Workflow comparison</p><h2 className="editorial mt-3 text-3xl"><Link href="/guides/faceless-videos-vs-ai-cartoons" className="hover:text-primary">Faceless videos vs AI cartoons: which should you create?</Link></h2><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">A narrated explainer and a character-led cartoon need different production choices. Compare visuals, dialogue, supported durations, review stages and limitations, with example briefs you can adapt.</p><Link className="mt-5 inline-block text-sm font-semibold text-primary underline" href="/guides/faceless-videos-vs-ai-cartoons">Read the workflow comparison</Link></article>
    <section><h2 className="editorial text-3xl">Before you generate</h2><ol className="mt-5 list-decimal space-y-4 pl-6 text-sm leading-7 text-muted-foreground"><li>Decide what the audience should learn or feel. One clear idea is easier to express in a short video than several competing messages.</li><li>Choose whether a narrator or an on-screen character carries the story. This determines which ETA workflow is the better fit.</li><li>Keep your script or scene actions within the selected duration. Shorter, specific instructions are easier to review than a broad list of visual requests.</li><li>Review the plan, output format and credit estimate before rendering. AI-generated imagery and dialogue still need a human quality check.</li></ol><p className="mt-6 text-sm leading-7">Explore the <Link href="/features" className="text-primary underline">available tools</Link> for current capabilities or check <Link href="/pricing" className="text-primary underline">plans and credits</Link> before starting a project.</p></section>
  </MarketingPage>;
}
