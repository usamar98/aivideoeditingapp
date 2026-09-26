import Link from "next/link";
import { ArrowRight, AudioLines, Captions, Clapperboard, Film, Layers3, WandSparkles } from "lucide-react";
import { BrandMark } from "@/components/studio/brand-mark";
import { Button } from "@/components/ui/button";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { PricingCards } from "@/components/billing/pricing-cards";
import { brand } from "@/config/brand";
import { AnswerSection } from "@/components/marketing/answer-section";
import { SiteFooter } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { homeFaqs } from "@/lib/seo/editorial-content";
import { publicMetadata } from "@/lib/seo/metadata";
import { pageSchema } from "@/lib/seo/structured-data";
import { getPublishedFeaturesData } from "@/lib/features/repository";

export const metadata = publicMetadata({ title: "AI Video Generator for Stories, Cartoons & UGC Ads", description: brand.description, path: "/" });

export const dynamic = "force-dynamic";

export default async function Home() {
  const published = new Set((await getPublishedFeaturesData()).map((feature) => feature.slug));
  return <main id="main-content">
    <JsonLd data={pageSchema("/", "AI video generator for stories, cartoons and UGC ads", brand.description)} />
    <header className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-4 px-6 lg:px-10">
      <Link href="/" aria-label={`${brand.name} home`}><BrandMark /></Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm md:flex"><Link href="/features">Creative tools</Link><a href="#how-it-works">How it works</a><Link href="/pricing">Pricing</Link><Link href="/guides">Guides</Link></nav>
      <div className="flex items-center gap-3"><Link href="/login" className="hidden text-sm sm:block">Log in</Link><Button asChild className="rounded-full"><Link href="/studio">Open studio <ArrowRight /></Link></Button></div>
    </header>
    <HeroShowcase>
      <p className="eyebrow inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/90 px-4 py-2 text-primary"><span className="size-1.5 rounded-full bg-primary" /> An idea is all it takes.</p>
      <h1 className="mt-7 text-5xl leading-[1.02] tracking-[-.055em] sm:text-7xl xl:text-[5.25rem]">Your imagination.<br /><span className="editorial italic text-primary">Made to move.</span></h1>
      <p className="mx-auto mt-6 max-w-lg text-base leading-7 text-muted-foreground">AI videos, cartoons, product ads and podcast Shorts.<br className="hidden sm:block" /> Bring the idea. Make every frame yours.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild size="lg" className="rounded-full px-7"><Link href="/studio">Start creating <ArrowRight /></Link></Button><Button asChild variant="outline" size="lg" className="rounded-full"><a href="#tools">Explore the tools</a></Button></div>
      <p className="mt-5 text-xs text-muted-foreground">Your script. Your style. Your next story.</p>
    </HeroShowcase>
    <div className="border-y border-border"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-5 px-6 py-6 text-xs font-medium text-muted-foreground lg:px-10">{[{icon:WandSparkles,label:"Start with an idea"},{icon:Layers3,label:"Make every scene yours"},{icon:AudioLines,label:"Give your story a voice"},{icon:Captions,label:"Ready for the small screen"}].map(({icon:Icon,label}) => <span key={label} className="flex items-center gap-3"><Icon className="size-4 text-primary" />{label}</span>)}</div></div>
    <section id="tools" className="mx-auto max-w-7xl px-6 py-20 lg:px-10"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">One studio. More ways to create.</p><h2 className="editorial mt-4 text-4xl tracking-tight sm:text-5xl">What will you make today?</h2></div><p className="max-w-xs text-sm leading-6 text-muted-foreground">Create something new, or turn an existing recording into captioned Shorts.</p></div>
      <FeatureGrid published={[...published]} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-primary/25 p-6"><div className="flex items-center gap-4"><Film className="size-6 text-primary" /><div><h3 className="font-semibold">One account. A growing creative toolkit.</h3><p className="mt-1 text-sm text-muted-foreground">Use the same workspace and credits across the available tools. Planned features are not available yet.</p></div></div><Link href="/features" className="text-sm text-primary underline underline-offset-4">Compare all tools →</Link></div>
    </section>
    <section id="how-it-works" className="bg-[#e9eef9] px-6 py-20"><div className="mx-auto max-w-6xl"><p className="eyebrow text-primary">Less setup. More storytelling.</p><h2 className="editorial mt-4 text-4xl">From a blank page to a finished story.</h2><div className="mt-10 grid gap-10 md:grid-cols-3">{[["01","Bring an idea","A topic, a rough script, a little curiosity. That’s all you need to get started."],["02","Make it your own","Review the narration, edit visual prompts, choose your format, and approve your scenes."],["03","Let it come together","Render voiceover, visuals, and timed captions into a video you can download."]].map(([n,title,copy]) => <div key={n}><span className="font-mono text-xs text-primary">{n} —</span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{copy}</p></div>)}</div></div></section>
    <section id="pricing" aria-labelledby="pricing-heading" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20">
      <div className="mb-10 text-center"><p className="eyebrow text-primary">A plan for your next chapter</p><h2 id="pricing-heading" className="editorial mt-4 text-4xl tracking-tight sm:text-5xl">Small beginnings. Bigger possibilities.</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">Three credit budgets. The same creative freedom. Choose monthly flexibility or a full year of credits at a lower price.</p></div>
      <PricingCards />
      <p className="mt-6 text-center text-sm"><Link href="/pricing" className="text-primary underline underline-offset-4">Compare full annual charges, credits and billing details</Link></p>
    </section>
    <div className="mx-auto max-w-6xl px-6"><AnswerSection answers={homeFaqs} /><p className="mt-6 text-sm"><Link href="/guides/faceless-videos-vs-ai-cartoons" className="text-primary underline underline-offset-4">Faceless video or AI cartoon? Read the workflow comparison.</Link></p></div>
    <section className="mx-auto max-w-6xl px-6 py-20 text-center"><Clapperboard className="mx-auto size-7 text-primary" /><h2 className="editorial mt-5 text-4xl sm:text-5xl">Your next story starts here.</h2><p className="mt-4 text-muted-foreground">A small idea is a perfectly good place to begin.</p><Button asChild size="lg" className="mt-7 rounded-full"><Link href="/studio">Find your creative tool <ArrowRight /></Link></Button></section>
    <SiteFooter />
  </main>;
}
