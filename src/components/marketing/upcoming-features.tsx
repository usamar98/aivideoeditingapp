import Image from "next/image";
import Link from "next/link";

/** Shared fifth card on the homepage, features directory and studio. */
export function UpcomingFeatures({ headingLevel: Heading = "h3", studio = false }: { headingLevel?: "h2" | "h3"; studio?: boolean } = {}) {
  return <article data-feature="digital-clone" className="overflow-hidden rounded-2xl border border-border bg-card">
    <Link href={studio ? "/studio/presenter" : "/features/ai-digital-clone-presenter"} aria-label="AI digital-clone presenter" className="group flex h-full flex-col transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
      <div className="relative aspect-video shrink-0 overflow-hidden bg-[#dce5f5]">
        <Image src="/examples/ai-portrait-poster.jpg" alt="AI-generated portrait inspiration, not an ETA clone or speaking demo" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" className="object-contain" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-10 text-[10px] font-medium uppercase tracking-[.12em] text-white">AI portrait inspiration · Pixabay</span>
      </div>
      <Heading className="p-6 text-xl font-semibold transition-colors group-hover:text-primary">AI digital-clone presenter</Heading>
    </Link>
  </article>;
}
