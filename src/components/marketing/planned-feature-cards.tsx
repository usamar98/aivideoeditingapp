import { BookOpen, Clapperboard, Film, House, Megaphone, Repeat2, Smartphone, Sparkles, Theater } from "lucide-react";

const plannedFeatures = [
  { slug: "short-film", title: "Short Film", icon: Clapperboard, background: "from-[#1c3154] to-[#507da4]", accent: "#c7deff" },
  { slug: "real-estate", title: "Real Estate", icon: House, background: "from-[#d8e5dc] to-[#8da899]", accent: "#285748" },
  { slug: "ad-remake", title: "Ad Remake", icon: Repeat2, background: "from-[#ead5c5] to-[#c89987]", accent: "#784736" },
  { slug: "social-content", title: "Social Content", icon: Smartphone, background: "from-[#dedcf4] to-[#b2b1e1]", accent: "#544b99" },
  { slug: "micro-drama", title: "Micro Drama", icon: Theater, background: "from-[#47364e] to-[#a06c8b]", accent: "#f8d7eb" },
  { slug: "brand-film", title: "Brand Film", icon: Sparkles, background: "from-[#e6deca] to-[#bcab83]", accent: "#655333" },
  { slug: "explainer", title: "Explainer", icon: BookOpen, background: "from-[#d6e8ec] to-[#95bec8]", accent: "#306270" },
  { slug: "film-trailer", title: "Film Trailer", icon: Film, background: "from-[#202e47] to-[#656c8b]", accent: "#d6dcfb" },
  { slug: "promo-video", title: "Promo video", icon: Megaphone, background: "from-[#f0d7c5] to-[#d9a17e]", accent: "#834b2d" },
] as const;

/** Roadmap previews only: no routes, generation actions, or paid entitlements. */
export function PlannedFeatureCards() {
  return plannedFeatures.map(({ slug, title, icon: Icon, background, accent }) => (
    <article key={slug} data-feature={slug} data-availability="coming-soon" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className={`relative isolate flex aspect-video items-center justify-center overflow-hidden bg-linear-to-br ${background}`}>
        <div aria-hidden="true" className="absolute inset-0 opacity-20 [background-image:linear-gradient(#fff3_1px,transparent_1px),linear-gradient(90deg,#fff3_1px,transparent_1px)] [background-size:24px_24px]" />
        <div aria-hidden="true" className="absolute -right-8 -bottom-16 size-48 rounded-full border-[24px] border-white/10" />
        <div aria-hidden="true" className="mt-5 flex h-20 w-28 -rotate-6 items-center justify-center rounded-2xl border border-white/40 bg-white/15 shadow-lg backdrop-blur-sm" style={{ color: accent }}>
          <Icon className="size-12" strokeWidth={1.5} />
        </div>
        <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#21478e]">Coming soon</span>
      </div>
      <h3 className="p-6 text-xl font-semibold">{title}</h3>
    </article>
  ));
}
