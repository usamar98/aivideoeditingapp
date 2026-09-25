import Image from "next/image";
import { CalendarClock, ScanFace, ShieldCheck } from "lucide-react";
import { SocialPlatformIcon, socialPlatforms } from "./social-platform-icon";

const platformArtwork = {
  TikTok: "/examples/ai-portrait-poster.jpg",
  Instagram: "/examples/presenter-product.webp",
  Facebook: "/examples/cartoon-forest.webp",
  YouTube: "/examples/faceless-space.webp",
};

export function UpcomingFeatures() {
  return <section className="mt-14" aria-label="Coming soon to ETA">
    <div className="mb-7"><p className="eyebrow text-primary">Next in your studio</p><h2 className="editorial mt-3 text-3xl sm:text-4xl">More you. More places to be.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A preview of what’s planned. These tools aren’t available yet and aren’t included as working features in any plan.</p></div>
    <article className="grid overflow-hidden rounded-3xl border border-primary/20 bg-card md:grid-cols-[.85fr_1.15fr]" aria-labelledby="digital-clone-title">
      <div className="relative flex min-h-96 items-center justify-center overflow-hidden bg-[#dce5f5] px-8 py-7">
        <div className="absolute size-80 rounded-full border border-primary/15" /><div className="absolute size-[27rem] rounded-full border border-primary/10" />
        <div className="relative w-52 overflow-hidden rounded-[2rem] border-[5px] border-white/85 bg-[#172d4e] shadow-2xl">
          <video controls controlsList="nodownload" playsInline muted preload="none" poster="/examples/ai-portrait-poster.jpg" width={540} height={968} className="block aspect-[9/16] w-full object-cover" aria-label="Play AI-generated portrait inspiration" aria-describedby="clone-video-credit">
            <source src="/examples/ai-portrait.webm" type="video/webm" /><source src="/examples/ai-portrait.mp4" type="video/mp4" />
          </video>
        </div>
        <span className="absolute right-6 top-6 grid size-12 place-items-center rounded-2xl border border-white/80 bg-white/70 text-primary shadow-sm"><ScanFace /></span>
        <span className="absolute bottom-8 left-5 rounded-full bg-white/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary shadow-sm">AI portrait inspiration</span>
      </div>
      <div className="flex flex-col justify-center p-7 sm:p-10"><span className="w-fit rounded-full border border-primary/20 bg-accent/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">Coming soon</span><h3 id="digital-clone-title" className="editorial mt-5 text-3xl leading-tight sm:text-4xl">AI digital-clone<br />presenter videos</h3><p className="mt-5 text-sm leading-7 text-muted-foreground">Your on-camera presence, without filming every take. The planned workflow will turn an authorized reference and a script into presenter-led videos for your stories, tutorials and campaigns.</p><div className="mt-6 flex items-start gap-3 rounded-xl bg-accent/40 p-4 text-xs leading-6 text-primary"><ShieldCheck className="mt-1 size-5 shrink-0" /><p>Designed around consent: use your own likeness or a presenter who has explicitly authorized you. No impersonation.</p></div><p id="clone-video-credit" className="mt-5 text-[11px] leading-5 text-muted-foreground">Silent AI-generated stock portrait by <a href="https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">freestock_video / Pixabay</a>. Visual inspiration, not an ETA clone or a speaking demo.</p></div>
    </article>
    <div className="mb-6 mt-12 flex flex-wrap items-end justify-between gap-4"><div><h3 className="editorial text-3xl">Create here. Share everywhere.</h3><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Planned account connections, automatic publishing and scheduled posts—one place to organize your next upload.</p></div><CalendarClock className="size-7 text-primary" /></div>
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {socialPlatforms.map((platform) => <article key={platform} className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={`${platform} publishing — coming soon`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-accent"><Image src={platformArtwork[platform]} alt={`AI-generated concept for a planned ${platform} publishing workflow`} fill sizes="(max-width: 640px) 90vw, (max-width: 1280px) 45vw, 280px" className="object-cover" style={{ objectPosition: platform === "Instagram" ? "left center" : "center" }} /><div className="absolute inset-0 bg-gradient-to-t from-[#10213c]/80 via-transparent to-black/10" /><span className="absolute right-3 top-3 rounded-full bg-background/95 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Coming soon</span><SocialPlatformIcon platform={platform} className="absolute bottom-4 left-4 size-12 shadow-xl" /><span className="absolute bottom-5 right-4 text-[9px] uppercase tracking-wider text-white/85">AI concept</span></div>
        <div className="p-5"><h4 className="text-lg font-semibold">{platform}</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">Connect your {platform === "Facebook" ? "Page" : platform === "YouTube" ? "channel" : "account"}, then publish or schedule {platform === "YouTube" ? "videos and Shorts" : platform === "Instagram" ? "Reels" : platform === "Facebook" ? "videos and Reels" : "your videos"} from ETA.</p><p className="mt-4 flex items-center gap-2 text-xs font-medium text-primary"><CalendarClock className="size-3.5" />Auto-post & schedule · Planned</p></div>
      </article>)}
    </div>
    <p className="mt-5 text-[11px] leading-5 text-muted-foreground">Availability will depend on each platform’s permissions and review. No social account is connected by these previews. Platform names and icons identify the planned destinations; they do not imply endorsement.</p>
  </section>;
}
