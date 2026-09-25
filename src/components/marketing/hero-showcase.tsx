"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { SocialPlatformIcon, socialPlatforms } from "./social-platform-icon";

function subscribeMotion(callback: () => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", callback);
  return () => preference.removeEventListener("change", callback);
}
function motionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}
const noServerMotion = () => false;

function AmbientVideo({ name, active }: { name: "fantasy-forest" | "ai-portrait"; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    function synchronize() {
      if (active && visible && !document.hidden) void video!.play().catch(() => { /* The poster remains if autoplay is unavailable. */ });
      else video!.pause();
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize(); });
    observer.observe(video);
    document.addEventListener("visibilitychange", synchronize);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", synchronize); video.pause(); };
  }, [active]);
  return <video ref={ref} muted loop playsInline preload="none" tabIndex={-1} poster={`/examples/${name}-poster.jpg`} className="size-full object-cover" aria-hidden="true">
    <source src={`/examples/${name}.webm`} type="video/webm" /><source src={`/examples/${name}.mp4`} type="video/mp4" />
  </video>;
}

export function HeroShowcase({ children }: { children?: ReactNode }) {
  const allowed = useSyncExternalStore(subscribeMotion, motionAllowed, noServerMotion);
  const [paused, setPaused] = useState(false);
  const active = allowed && !paused;
  return <section className="hero-canvas" data-motion={active ? "on" : "off"} aria-label="Create with ETA">
    <div className="hero-orbit" aria-hidden="true">
      <div className="hero-phone hero-phone-space"><Image src="/examples/faceless-space.webp" alt="" fill sizes="(max-width: 640px) 140px, 220px" className="object-cover" /><span>Ideas, made cinematic.</span></div>
      <div className="hero-phone hero-phone-cartoon"><Image src="/examples/cartoon-forest.webp" alt="" fill sizes="(max-width: 640px) 140px, 220px" className="object-cover" /><span>A cast of possibilities.</span></div>
      <div className="hero-phone hero-phone-presenter"><AmbientVideo name="ai-portrait" active={active} /><span>A face for your story.</span></div>
      <div className="hero-phone hero-phone-forest"><AmbientVideo name="fantasy-forest" active={active} /><span>Make a little magic.</span></div>
      {socialPlatforms.map((platform, index) => <div key={platform} className={`hero-social hero-social-${index}`}><SocialPlatformIcon platform={platform} className="size-14 rounded-[18px] shadow-xl" /></div>)}
    </div>
    <div className="hero-copy">{children}</div>
    <div className="hero-caption">
      <p>AI-generated inspiration, not ETA exports. Stock video: <a href="https://pixabay.com/videos/fantasy-nature-dream-ai-generated-203486/" target="_blank" rel="noopener noreferrer">michellemorseu</a> & <a href="https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/" target="_blank" rel="noopener noreferrer">freestock_video / Pixabay</a>.</p>
      <button type="button" onClick={() => setPaused((value) => !value)} disabled={!allowed} aria-pressed={active} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-background/90 px-3 py-2 text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">
        {active ? <Pause className="size-3" /> : <Play className="size-3" />}{!allowed ? "Motion off" : active ? "Pause motion" : "Play motion"}
      </button>
    </div>
  </section>;
}
