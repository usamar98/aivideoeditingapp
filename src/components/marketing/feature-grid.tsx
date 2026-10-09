import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Captions, House, Film, Mic, Scissors, Repeat2 } from "lucide-react";
import { ExampleVisual } from "./example-visual";
import { UpcomingFeatures } from "./upcoming-features";

const liveCards = [
  { slug: "faceless-video-generator", title: "Viral faceless Video", variant: "faceless", studioHref: "/studio/faceless" },
  { slug: "ai-cartoon-series", title: "Viral Cartoon videos", variant: "cartoon", studioHref: "/studio/cartoons" },
  { slug: "ai-ugc-product-ads", title: "AI UGC and product-ad studio", variant: "ugc", studioHref: "/studio/ugc" },
] as const;

export const featuredToolSlugs: readonly string[] = [...liveCards.map((card) => card.slug), "podcast-to-shorts", "ai-digital-clone-presenter", "ai-short-film-generator", "ai-real-estate-video-generator", "ai-ad-remake"];

export function FeatureGrid({ published, mode = "marketing", additionalFeatures = [], desktopColumns = 3, children }: {
  published: string[];
  mode?: "marketing" | "studio" | "directory";
  additionalFeatures?: { slug: string; name: string; description: string }[];
  desktopColumns?: 3 | 4;
  children?: ReactNode;
}) {
  const studio = mode === "studio";
  const Heading = mode === "marketing" ? "h3" : "h2";
  const compact = !studio && desktopColumns === 4;
  const imageSizes = compact ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px";
  const gridClassName = studio ? "mt-8 grid items-stretch gap-6 @xl:grid-cols-2 @4xl:grid-cols-3" : compact ? "mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4" : "mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3";
  return <div className={gridClassName} data-testid="feature-grid">
    {published.includes("ai-ad-remake") ? <article data-feature="ai-ad-remake" className="overflow-hidden rounded-2xl border border-border bg-card"><Link href={studio ? "/studio/ad-remake" : "/features/ai-ad-remake"} aria-label="Ad Remake" className="group flex h-full flex-col hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"><div className="relative flex aspect-video items-center justify-center gap-5 bg-[#183f3e] p-6 text-[#f4eedf]"><div className="rounded-xl border border-white/20 p-5 text-xs">REFERENCE</div><Repeat2 className="size-7"/><div className="rounded-xl border border-white/20 p-5 text-xs">YOUR PRODUCT</div><span className="absolute bottom-2 text-[9px] uppercase tracking-wider text-white/60">Workflow illustration · Not generated footage</span></div><Heading className="p-6 text-xl font-semibold group-hover:text-primary">Ad Remake</Heading></Link></article> : null}
    {published.includes("ai-real-estate-video-generator") && <article data-feature="ai-real-estate-video-generator" className="overflow-hidden rounded-2xl border border-border bg-card"><Link href={studio ? "/studio/real-estate" : "/features/ai-real-estate-video-generator"} aria-label="Real estate video studio" className="group flex h-full flex-col hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"><div className="relative flex aspect-video items-center justify-center gap-3 bg-[#183f3e] px-6 text-[#f4eedf]" aria-label="Illustration of a room-by-room listing tour">{["EXTERIOR", "LIVING", "DETAILS"].map((label, i) => <div key={label} className="flex h-24 flex-1 flex-col justify-end rounded-lg border border-white/20 bg-white/5 p-3"><House className="mb-auto size-5 opacity-70"/><span className="text-[8px] tracking-wider">0{i + 1} / {label}</span></div>)}<span className="absolute bottom-2 text-[9px] uppercase tracking-wider text-white/60">Workflow illustration · Not generated footage</span></div><Heading className="p-6 text-xl font-semibold group-hover:text-primary">Real estate video studio</Heading></Link></article>}
    {liveCards.filter((card) => published.includes(card.slug)).map((card) => <article data-feature={card.slug} key={card.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={studio ? card.studioHref : `/features/${card.slug}`} aria-label={card.title} className="group flex h-full flex-col transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <ExampleVisual variant={card.variant} sizes={imageSizes} loading={studio && card.variant === "faceless" ? "eager" : "lazy"} className="shrink-0" />
        <Heading className="p-6 text-xl font-semibold transition-colors group-hover:text-primary">{card.title}</Heading>
      </Link>
    </article>)}
    {published.includes("ai-short-film-generator") && <article data-feature="ai-short-film-generator" className="overflow-hidden rounded-2xl border border-border bg-card"><Link href={studio ? "/studio/films" : "/features/ai-short-film-generator"} aria-label="AI Short Film" className="group flex h-full flex-col hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"><div className="relative flex aspect-video items-center justify-center gap-3 bg-[#12202b] px-6 text-[#f4dfb8]" aria-label="Illustration of a three-shot film plan">{["SETUP","TURN","RESOLVE"].map((label,i)=><div key={label} className="flex h-24 flex-1 flex-col justify-end rounded-lg border border-white/20 bg-white/5 p-3"><Film className="mb-auto size-5 opacity-70"/><span className="text-[9px] tracking-widest">0{i+1} / {label}</span></div>)}<span className="absolute bottom-2 text-[9px] uppercase tracking-wider text-white/60">Workflow illustration · Not generated footage</span></div><Heading className="p-6 text-xl font-semibold group-hover:text-primary">AI Short Film</Heading></Link></article>}
    {published.includes("podcast-to-shorts") && <article data-feature="podcast-to-shorts" className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={studio ? "/studio/shorts" : "/features/podcast-to-shorts"} aria-label="Podcast & video to Shorts" className="group flex h-full flex-col transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <div className={`relative flex aspect-video shrink-0 items-center overflow-hidden bg-[#10294d] text-white ${compact ? "gap-3 px-4" : "gap-5 px-6"}`} aria-label="Illustration of a podcast becoming captioned vertical clips">
          <div className={`flex flex-1 flex-col items-center ${compact ? "gap-1" : "gap-4"}`}><Mic className={compact ? "size-7 text-blue-200" : "size-9 text-blue-200"} /><div className="flex h-12 items-center gap-1" aria-hidden>{Array.from({ length: compact ? 9 : 15 }, (_, i) => <span key={i} className="w-1 rounded-full bg-blue-200/60" style={{ height: 12 + i * 17 % 35 }} />)}</div></div>
          <ArrowRight className="size-5 shrink-0 text-blue-200" /><div className={`flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/25 bg-[#3562cc] ${compact ? "h-24 w-16 gap-2" : "h-36 w-20 gap-4"}`}><Scissors className={compact ? "size-4" : "size-6"} /><span className={`rounded bg-[#f7efcf] py-1 font-bold text-[#10294d] ${compact ? "px-1 text-[8px]" : "px-2 text-[10px]"}`}>THE MOMENT</span><Captions className={compact ? "size-4" : "size-5"} /></div>
          <span className="absolute bottom-2 inset-x-0 text-center text-[9px] uppercase tracking-wider text-blue-100">Workflow illustration · Not generated footage</span>
        </div>
        <Heading className="p-6 text-xl font-semibold transition-colors group-hover:text-primary">Podcast & video to Shorts</Heading>
      </Link>
    </article>}
    {published.includes("ai-digital-clone-presenter") && <UpcomingFeatures headingLevel={Heading} studio={studio} sizes={imageSizes} />}
    {additionalFeatures.filter((feature) => published.includes(feature.slug) && !featuredToolSlugs.includes(feature.slug)).map((feature) => <article key={feature.slug} data-feature={feature.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={`/features/${feature.slug}`} aria-label={feature.name} className="group flex h-full flex-col transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <div className="grid aspect-video place-items-center bg-accent"><Film aria-hidden className="size-16 text-primary" /></div>
        <Heading className="p-6 text-xl font-semibold transition-colors group-hover:text-primary">{feature.name}</Heading>
      </Link>
    </article>)}
    {children}
  </div>;
}
