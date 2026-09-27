import { ScanFace } from "lucide-react";

/** Grid items, not a separate full-width section. Planned tools have no fake launch buttons. */
export function UpcomingFeatures({ headingLevel: Heading = "h3" }: { headingLevel?: "h2" | "h3" } = {}) {
  return <>
    <article data-feature="digital-clone" className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="digital-clone-title">
      <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden bg-[#dce5f5]">
        <div className="absolute size-64 rounded-full border border-primary/15" />
        <video controls controlsList="nodownload" playsInline muted preload="none" poster="/examples/ai-portrait-poster.jpg" width={540} height={968} className="absolute inset-0 h-full w-full object-contain" aria-label="Play AI-generated portrait inspiration" aria-describedby="clone-video-credit">
          <source src="/examples/ai-portrait.webm" type="video/webm" /><source src="/examples/ai-portrait.mp4" type="video/mp4" />
        </video>
        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">Coming soon</span>
        <ScanFace aria-hidden className="pointer-events-none absolute right-4 top-4 size-6 text-white" />
      </div>
      <div className="flex flex-1 flex-col p-6"><Heading id="digital-clone-title" className="text-xl font-semibold">AI digital-clone presenter</Heading><p className="mt-3 text-sm leading-6 text-muted-foreground">Your on-camera presence, without filming every take. Planned presenter videos from an authorized reference and a script.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">Use your own likeness or an explicitly authorized presenter. No impersonation.</p><p className="mt-auto pt-5 text-xs font-semibold text-primary">Coming soon · Not available yet</p><p id="clone-video-credit" className="mt-3 text-[10px] leading-4 text-muted-foreground">AI portrait inspiration by <a href="https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/" target="_blank" rel="noopener noreferrer" className="underline">freestock_video / Pixabay</a>, not an ETA clone or a speaking demo.</p></div>
    </article>
  </>;
}
