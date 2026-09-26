import Image from "next/image";
import { CalendarClock, ScanFace } from "lucide-react";
import { SocialPlatformIcon, socialPlatforms } from "./social-platform-icon";

const socialLinks = { TikTok: "https://www.tiktok.com/", Instagram: "https://www.instagram.com/", Facebook: "https://www.facebook.com/", YouTube: "https://www.youtube.com/" };

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
    <article data-feature="social-publishing" className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="social-publishing-title">
      <div className="relative aspect-video shrink-0 overflow-hidden bg-accent">
        <Image src="/examples/presenter-product.webp" alt="AI-generated concept for planned social video publishing" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#10213c]/90 via-[#10213c]/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">Coming soon</span>
        <div className="absolute inset-x-0 bottom-7 flex justify-center gap-3">{socialPlatforms.map((platform) => <a key={platform} href={socialLinks[platform]} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${platform} (external website; connection coming soon)`} className="rounded-2xl transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><SocialPlatformIcon platform={platform} className="size-11 shadow-xl" /></a>)}</div>
        <span className="absolute bottom-2 inset-x-0 text-center text-[9px] uppercase tracking-wider text-white/90">AI concept · Platform website links</span>
      </div>
      <div className="flex flex-1 flex-col p-6"><Heading id="social-publishing-title" className="text-xl font-semibold">Auto-post and schedule planned</Heading><p className="mt-3 text-sm leading-6 text-muted-foreground">One planned home for TikTok, Instagram, Facebook and YouTube. Connect your accounts, organize uploads and schedule your next post.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">These links open the platforms, not account connections. Publishing will depend on platform permissions and review.</p><p className="mt-auto flex items-center gap-2 pt-5 text-xs font-semibold text-primary"><CalendarClock className="size-4" />Coming soon · Not available yet</p><p className="mt-3 text-[10px] leading-4 text-muted-foreground">Not included as a working feature in any plan. Platform icons do not imply endorsement.</p></div>
    </article>
  </>;
}
