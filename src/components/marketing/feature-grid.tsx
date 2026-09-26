import Link from "next/link";
import { ArrowRight, Captions, Mic, Scissors } from "lucide-react";
import { ExampleVisual } from "./example-visual";
import { UpcomingFeatures } from "./upcoming-features";

const liveCards = [
  { slug: "faceless-video-generator", title: "Faceless video generation", variant: "faceless", label: "Narrated stories", description: "Turn an idea or script into a narrated short with AI visuals and captions.", detail: "Explainers · Stories · Educational shorts", studioHref: "/studio/faceless", studioAction: "Create faceless video" },
  { slug: "ai-cartoon-series", title: "AI Cartoon Studio", variant: "cartoon", label: "Character-led stories", description: "Turn a prompt or character artwork into an animated story with action and dialogue.", detail: "Characters · Animation · Storytelling", studioHref: "/studio/cartoons", studioAction: "Create a cartoon" },
  { slug: "ai-ugc-product-ads", title: "AI UGC and product-ad studio", variant: "ugc", label: "AI presenter ads", description: "Turn product photos or a link into presenter-led ads with three opening hooks and captions.", detail: "AI presenters · Product visuals · Hooks", studioHref: "/studio/ugc", studioAction: "Create product ads" },
] as const;

export function FeatureGrid({ published, mode = "marketing" }: { published: string[]; mode?: "marketing" | "studio" }) {
  const studio = mode === "studio";
  const Heading = studio ? "h2" : "h3";
  return <div className={studio ? "mt-8 grid items-stretch gap-6 @xl:grid-cols-2 @4xl:grid-cols-3" : "mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3"} data-testid="feature-grid">
    {liveCards.filter((card) => published.includes(card.slug)).map((card) => <article data-feature={card.slug} key={card.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={studio ? card.studioHref : `/features/${card.slug}`} className="group flex h-full flex-col">
        <ExampleVisual variant={card.variant} label={card.label} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" loading={studio && card.variant === "faceless" ? "eager" : "lazy"} className="shrink-0" />
        <div className="flex flex-1 flex-col p-6"><Heading className="text-xl font-semibold">{card.title}</Heading><p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">{card.detail}</p><span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-primary">{studio ? card.studioAction : "Explore the tool"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></div>
      </Link>
    </article>)}
    {published.includes("podcast-to-shorts") && <article data-feature="podcast-to-shorts" className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={studio ? "/studio/shorts" : "/features/podcast-to-shorts"} className="group flex h-full flex-col">
        <div className="relative flex aspect-video shrink-0 items-center gap-5 overflow-hidden bg-[#10294d] px-6 text-white" aria-label="Illustration of a podcast becoming captioned vertical clips">
          <div className="flex flex-1 flex-col items-center gap-4"><Mic className="size-9 text-blue-200" /><div className="flex h-12 items-center gap-1" aria-hidden>{Array.from({ length: 15 }, (_, i) => <span key={i} className="w-1 rounded-full bg-blue-200/60" style={{ height: 12 + i * 17 % 35 }} />)}</div></div>
          <ArrowRight className="size-5 shrink-0 text-blue-200" /><div className="flex h-36 w-20 shrink-0 flex-col items-center justify-center gap-4 rounded-xl border border-white/25 bg-[#3562cc]"><Scissors className="size-6" /><span className="rounded bg-[#f7efcf] px-2 py-1 text-[10px] font-bold text-[#10294d]">THE MOMENT</span><Captions className="size-5" /></div>
          <span className="absolute bottom-2 inset-x-0 text-center text-[9px] uppercase tracking-wider text-blue-100">Workflow illustration · Not generated footage</span>
        </div>
        <div className="flex flex-1 flex-col p-6"><p className="eyebrow text-primary">New / Podcast & video Shorts</p><Heading className="mt-2 text-xl font-semibold">Podcast & video to Shorts</Heading><p className="mt-3 text-sm leading-6 text-muted-foreground">Find useful moments in your recordings, refine speaker framing and add animated captions for vertical clips.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">Highlights · Framing · Animated captions</p><span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-primary">{studio ? "Create Shorts" : "Explore the video clipper"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></div>
      </Link>
    </article>}
    <UpcomingFeatures headingLevel={Heading} />
  </div>;
}
