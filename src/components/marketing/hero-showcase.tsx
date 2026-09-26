"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { SocialPlatformIcon } from "./social-platform-icon";
import { heroMediaRows, heroStockCredits } from "./hero-media";

type DataConnection = EventTarget & { saveData?: boolean };
const dataConnection = () => (navigator as Navigator & { connection?: DataConnection }).connection;

function subscribeMotion(callback: () => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = dataConnection();
  preference.addEventListener("change", callback);
  connection?.addEventListener("change", callback);
  return () => { preference.removeEventListener("change", callback); connection?.removeEventListener("change", callback); };
}
function motionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !dataConnection()?.saveData;
}
const noServerMotion = () => false;

export function HeroShowcase({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const allowed = useSyncExternalStore(subscribeMotion, motionAllowed, noServerMotion);
  const [paused, setPaused] = useState(false);
  const active = allowed && !paused;

  // One observer/listener for all reels, including seamless-loop duplicates.
  // No per-frame React updates, and no off-screen video decoding.
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    const videos = [...hero.querySelectorAll<HTMLVideoElement>("video")];
    const visibleVideos = new Set<HTMLVideoElement>();
    let heroVisible = false;
    function synchronize() {
      const playing = active && heroVisible && !document.hidden;
      hero!.dataset.visible = playing ? "true" : "false";
      for (const video of videos) {
        if (playing && visibleVideos.has(video)) {
          if (video.paused) void video.play().catch(() => { /* Keep the poster if autoplay is blocked. */ });
        } else video.pause();
      }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        else if (entry.isIntersecting) visibleVideos.add(entry.target as HTMLVideoElement);
        else visibleVideos.delete(entry.target as HTMLVideoElement);
      }
      synchronize();
    }, { threshold: 0.05 });
    observer.observe(hero);
    videos.forEach((video) => observer.observe(video));
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", synchronize);
      videos.forEach((video) => video.pause());
      hero.dataset.visible = "false";
    };
  }, [active]);

  return <section ref={ref} className="hero-canvas" data-motion={active ? "on" : "off"} aria-label="Create with ETA">
    <div className="hero-reels" aria-hidden="true">
      {heroMediaRows.map((row, rowIndex) => <div className="hero-reel-row" key={rowIndex} data-direction={rowIndex === 0 ? "left" : "right"}>
        <div className="hero-reel-track">
          {[0, 1].map((copy) => <div className="hero-reel-group" key={copy} data-copy={copy}>
            {row.map((media) => <div className="hero-reel" key={media.id}>
              {media.kind === "video" ? <video muted loop playsInline preload="none" tabIndex={-1} poster={`/examples/${media.name}-poster.jpg`} className="size-full object-cover" aria-hidden="true">
                <source src={`/examples/${media.name}.webm`} type="video/webm" /><source src={`/examples/${media.name}.mp4`} type="video/mp4" />
              </video> : <Image src={media.src} alt="" fill sizes="(max-width: 639px) 420px, (max-width: 1023px) 510px, 610px" className="object-cover" style={{ objectPosition: media.position }} />}
              <span className="hero-reel-tag">{media.label}</span>
              <div className="hero-reel-footer"><span>{media.detail}</span><SocialPlatformIcon platform={media.platform} className="size-7 rounded-lg shadow-sm" /></div>
            </div>)}
          </div>)}
        </div>
      </div>)}
    </div>
    <div className="hero-copy">{children}</div>
    <div className="hero-caption">
      <div>
        <p>AI stock & concept inspiration, not ETA exports. Digital clone is coming soon.</p>
        <details className="hero-credits"><summary>Media credits · Pixabay</summary><ul>{heroStockCredits.map((credit) => <li key={credit.href}><a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.name}</a></li>)}</ul><a href="https://pixabay.com/service/license-summary/" target="_blank" rel="noopener noreferrer">Pixabay Content License</a><p>Original AI concept images by ETA. Portraits are not cloning or speaking demos. Social icons are inspiration, not connected accounts.</p></details>
      </div>
      <button type="button" onClick={() => setPaused((value) => !value)} disabled={!allowed} aria-pressed={active} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-background/90 px-3 py-2 text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">
        {active ? <Pause className="size-3" /> : <Play className="size-3" />}{!allowed ? "Motion off" : active ? "Pause motion" : "Play motion"}
      </button>
    </div>
  </section>;
}
