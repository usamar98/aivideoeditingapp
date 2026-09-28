import Link from "next/link";
import { ScanFace, ArrowRight } from "lucide-react";
import { PreviewVideo } from "./preview-video";

/** Shared fifth card on the homepage, features directory and studio. */
export function UpcomingFeatures({ headingLevel: Heading = "h3", studio = false }: { headingLevel?: "h2" | "h3"; studio?: boolean } = {}) {
  return <>
    <article data-feature="digital-clone" className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="digital-clone-title">
      <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden bg-[#dce5f5]">
        <div className="absolute size-64 rounded-full border border-primary/15" />
        <PreviewVideo className="absolute inset-0 h-full w-full" videoClassName="object-contain" poster="/examples/ai-portrait-poster.jpg" width={540} height={968} label="AI-generated portrait inspiration" describedBy="clone-video-credit" sources={[
          { src: "/examples/ai-portrait.webm", type: "video/webm" },
          { src: "/examples/ai-portrait.mp4", type: "video/mp4" },
        ]} />
        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">Photo-based presenter</span>
        <ScanFace aria-hidden className="pointer-events-none absolute right-4 top-4 size-6 text-white" />
      </div>
      <div className="flex flex-1 flex-col p-6"><Heading id="digital-clone-title" className="text-xl font-semibold">AI digital-clone presenter</Heading><p className="mt-3 text-sm leading-6 text-muted-foreground">Turn an authorized portrait and a reviewed script into a talking video with a studio voice, lip sync and captions.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">Reusable portraits · Private exports · No voice cloning</p><Link href={studio ? "/studio/presenter" : "/features/ai-digital-clone-presenter"} className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-primary">{studio ? "Create a presenter video" : "Explore the presenter studio"}<ArrowRight className="size-4" /></Link><p id="clone-video-credit" className="mt-3 text-[10px] leading-4 text-muted-foreground">AI portrait inspiration by <a href="https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/" target="_blank" rel="noopener noreferrer" className="underline">freestock_video / Pixabay</a>, not an ETA clone or a speaking demo.</p></div>
    </article>
  </>;
}
