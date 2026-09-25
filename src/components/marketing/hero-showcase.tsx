import { ExampleVisual } from "@/components/marketing/example-visual";

/** A media-first showcase. Playback is opt-in, including for reduced-motion users. */
export function HeroShowcase() {
  return (
    <div className="min-w-0" aria-label="AI-generated creative inspiration">
      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">
        <span>Imagine it in motion</span><span className="text-primary">A little inspiration ↙</span>
      </div>
      <figure>
        <div className="relative overflow-hidden rounded-t-[1.5rem] bg-[#102923]">
          <video
            controls
            controlsList="nodownload"
            playsInline
            muted
            preload="none"
            poster="/examples/fantasy-forest-poster.jpg"
            width={1920}
            height={1080}
            aria-label="Play AI-generated fantasy forest video"
            aria-describedby="hero-video-description"
            className="block aspect-video w-full object-cover"
          >
            <source src="/examples/fantasy-forest.webm" type="video/webm" />
            <source src="/examples/fantasy-forest.mp4" type="video/mp4" />
            Your browser does not support video playback. View the source using the credit below.
          </video>
          <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white">AI-generated video · 6 seconds</span>
        </div>
        <figcaption id="hero-video-description" className="sr-only">A silent AI-generated fantasy forest with glowing mushrooms and drifting lights. Stock inspiration, not an ETA export.</figcaption>
      </figure>
      <div className="mt-1 grid grid-cols-3 gap-1 overflow-hidden rounded-b-[1.5rem]" aria-label="AI-generated image concepts">
        {([
          ["faceless", "Cinematic worlds"],
          ["cartoon", "Original characters"],
          ["ugc", "Product stories"],
        ] as const).map(([variant, label]) => (
          <figure key={variant} className="relative">
            <ExampleVisual variant={variant} disclosure={false} className="aspect-[4/3]" sizes="(max-width: 640px) 33vw, (max-width: 1024px) 200px, 190px" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-3 pt-8 text-center text-[10px] font-medium text-white sm:text-xs">{label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        AI-generated inspiration, not ETA exports. Video by{" "}
        <a href="https://pixabay.com/videos/fantasy-nature-dream-ai-generated-203486/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">michellemorseu / Pixabay</a>.
      </p>
    </div>
  );
}
