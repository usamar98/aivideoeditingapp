import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clapperboard, Layers3, RotateCcw, Sparkles } from "lucide-react";

import { BrandMark } from "@/components/studio/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";

const capabilities = [
  { icon: Layers3, title: "A living series guide", copy: "Keep visual style, locations, relationships, and episode history in one reusable source of truth." },
  { icon: Check, title: "Approve before animation", copy: "Review character-guided storyboard frames before committing animation credits." },
  { icon: RotateCcw, title: "Change one scene", copy: "Edit dialogue, captions, voice, order, or a single scene without rebuilding the full episode." },
];

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${brand.siteUrl}/#organization`, name: brand.name, url: brand.siteUrl },
      { "@type": "WebSite", "@id": `${brand.siteUrl}/#website`, name: brand.name, url: brand.siteUrl, publisher: { "@id": `${brand.siteUrl}/#organization` } },
      { "@type": "WebApplication", name: brand.name, applicationCategory: "MultimediaApplication", operatingSystem: "Web", description: brand.description, url: brand.siteUrl, featureList: capabilities.map((item) => item.title), publisher: { "@id": `${brand.siteUrl}/#organization` } },
    ],
  };

  return (
    <main className="min-h-screen overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }} />
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label={`${brand.name} home`}><BrandMark /></Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
          <Link href="/features/ai-cartoon-series" className="hover:text-foreground">Cartoon series</Link>
          <Link href="/features" className="hover:text-foreground">Features</Link>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </nav>
        <Button asChild size="sm"><Link href="/studio">Open studio <ArrowRight /></Link></Button>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:pb-28 lg:pt-20">
        <div>
          <Badge variant="warning"><Sparkles /> Recurring-character cartoons</Badge>
          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl">Make the next episode without reinventing the cast.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Create 30–60 second animated stories with saved characters, voices, visual rules, and scene-by-scene control. Review the storyboard first, then animate only what you approve.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href="/studio/series/pip-and-moss/episodes/the-cloud-in-a-jar"><Clapperboard /> Try the episode editor</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/features/ai-cartoon-series">See how continuity works</Link></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Development fixture included. Real generation requires connected provider credentials.</p>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <Card className="overflow-hidden border-primary/20 bg-card/85 p-2 shadow-[0_30px_100px_-35px_rgb(0_0_0/0.9)]">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-secondary">
              <Image src="/demo/weather-workshop.png" alt="Pip and Moss reviewing their pocket weather machine in a 3D cartoon storyboard frame" fill loading="eager" fetchPriority="high" sizes="(max-width: 1024px) 100vw, 58vw" className="object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/85 via-black/10 to-transparent p-4 pt-16">
                <div><p className="text-sm font-semibold text-white">The Cloud in a Jar</p><p className="mt-1 text-xs text-white/70">Scene 01 · Approved frame</p></div>
                <Badge variant="success"><Check /> Character references locked</Badge>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2 pt-4">
              {["Script", "Storyboard", "Animate"].map((label, index) => <div key={label} className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${index < 2 ? "border-primary/25 bg-primary/8 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>{String(index + 1).padStart(2, "0")} · {label}</div>)}
            </div>
          </Card>
        </div>
      </section>

      <section className="border-y border-border bg-card/35">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          {capabilities.map((item) => {
            const Icon = item.icon;
            return <article key={item.title} className="bg-background p-7 sm:p-9"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><h2 className="mt-5 text-lg font-semibold">{item.title}</h2><p className="mt-2 text-base leading-7 text-muted-foreground">{item.copy}</p></article>;
          })}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Continuity with honest limits</p>
        <h2 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Your references stay reusable. Every frame still gets reviewed.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Generated characters can drift, especially across poses and camera angles. {brand.name} keeps approved assets and settings attached to the series, then gives you a review gate before animation. It does not promise perfect identity preservation.</p>
      </section>
    </main>
  );
}
