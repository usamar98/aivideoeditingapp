"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, CircleHelp, Clapperboard, LayoutGrid, LockKeyhole, Sparkles } from "lucide-react";
import { SocialPlatformIcon } from "./social-platform-icon";
import styles from "./channel-showcase.module.css";

const channels = ["YouTube", "TikTok"] as const;
type Channel = (typeof channels)[number];

const previews = [
  { name: "hero-ugc", title: "Make them stop scrolling.", label: "Product-ad inspiration", tag: "Product stories", description: "Silent AI-generated beauty-ad concept" },
  { name: "ai-portrait", title: "Give your ideas a face.", label: "Portrait inspiration", tag: "Creator concepts", description: "Silent AI-generated portrait, not a digital-clone demonstration" },
  { name: "hero-cartoon", title: "A little story. A big feeling.", label: "Cartoon inspiration", tag: "Character worlds", description: "Silent AI-generated cartoon sloth clip" },
] as const;

/** An interactive marketing concept, never connected-account data or promised results. */
export function ChannelShowcase() {
  const [channel, setChannel] = useState<Channel>("YouTube");
  const youtube = channel === "YouTube";

  return <section id="channel-preview" aria-labelledby="channel-showcase-title" className={styles.section}>
    <div className={styles.frame}>
      <header className={styles.topbar}>
        <div className={styles.heading}><span className={styles.brandIcon}><Clapperboard aria-hidden size={19} /></span><h2 id="channel-showcase-title">Connect and Grow your channel on automation</h2></div>
        <div className={styles.platforms} aria-label="YouTube publishing and planned TikTok publishing">
          <span aria-label="TikTok — coming soon"><SocialPlatformIcon platform="TikTok" className="size-8 rounded-xl" /></span>
          <span aria-label="YouTube"><SocialPlatformIcon platform="YouTube" className="size-8 rounded-xl" /></span>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Channel preview options">
          <div className={styles.workspaceName}><span className={styles.workspaceAvatar}>E</span><div><strong>Your creative space</strong><span>Workspace preview</span></div><ChevronDown aria-hidden size={14} /></div>
          <p className={styles.sidebarLabel}>Your channels <span>02</span></p>
          <div className={styles.channelOptions}>
            {channels.map((name) => <button type="button" key={name} aria-pressed={channel === name} aria-controls="channel-preview-panel" onClick={() => setChannel(name)} className={styles.channelButton}>
              <SocialPlatformIcon platform={name} className="size-9 rounded-xl" />
              <span><strong>{name}</strong><small>{name === "YouTube" ? "Publishing workspace" : "Coming soon"}</small></span>
              {channel === name && <Check aria-hidden size={14} />}
            </button>)}
          </div>
          <div className={styles.sidebarNav}>
            <p><LayoutGrid aria-hidden size={15} /> Content library</p>
            <p><CalendarDays aria-hidden size={15} /> Publishing calendar</p>
          </div>
          <div className={styles.sidebarNote}><Sparkles aria-hidden size={17} /><p>One idea can become<br /><strong>your next great video.</strong></p></div>
          <span className={styles.previewBadge}><span /> Design preview</span>
        </aside>

        <div id="channel-preview-panel" className={styles.content}>
          <div className={styles.accountHeader}>
            <div className={styles.accountIdentity}><SocialPlatformIcon platform={channel} className="size-11 rounded-2xl" /><div><h3>Your next chapter starts here.</h3><p>{channel} <span>·</span> Your channel, your creative direction</p></div></div>
            <span className={styles.status}>{youtube ? "Review before publishing" : "Coming soon"}</span>
          </div>

          <dl className={styles.metrics} aria-label="Analytics placeholders, not live results">
            {["Video views", "Community", "Engagement"].map((label) => <div key={label}><dt>{label}</dt><dd aria-label="No connected account data">—</dd><span>Connect to start your story</span></div>)}
          </dl>

          <figure className={styles.chart}>
            <figcaption><strong>A little consistency. More possibility.</strong><span>Illustrative activity · Not live analytics</span></figcaption>
            <svg viewBox="0 0 840 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs><linearGradient id="channel-preview-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4b6ad8" stopOpacity=".15" /><stop offset="100%" stopColor="#4b6ad8" stopOpacity="0" /></linearGradient></defs>
              {[20, 60, 100].map((y) => <line key={y} x1="0" x2="840" y1={y} y2={y} stroke="#e9edf4" strokeDasharray="5 7" />)}
              <path d="M0 106 C40 106 40 101 82 101 S127 96 165 96 S210 84 247 84 S292 86 329 73 S371 72 410 64 S454 70 496 51 S538 54 578 41 S629 44 660 30 S713 37 750 20 S801 24 840 9 L840 120 L0 120Z" fill="url(#channel-preview-fill)" />
              <path d="M0 106 C40 106 40 101 82 101 S127 96 165 96 S210 84 247 84 S292 86 329 73 S371 72 410 64 S454 70 496 51 S538 54 578 41 S629 44 660 30 S713 37 750 20 S801 24 840 9" stroke="#4b6ad8" strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className={styles.chartLabels}><span>Create</span><span>Refine</span><span>Share</span><span>Repeat</span></div>
          </figure>

          <div className={styles.libraryHeading}><h3>Small screen. Endless possibilities.</h3><span>AI inspiration · Tap to play</span></div>
          <div className={styles.videoGrid}>
            {previews.map((preview) => <figure key={preview.name} className={styles.videoCard}>
              <div className={styles.videoFrame}>
                <video controls playsInline muted preload="none" poster={`/examples/${preview.name}-poster.jpg`} width={360} height={640} aria-label={preview.description} aria-describedby="channel-media-note">
                  <source src={`/examples/${preview.name}.webm`} type="video/webm" />
                  <source src={`/examples/${preview.name}.mp4`} type="video/mp4" />
                  Your browser does not support this video preview.
                </video>
                <div className={styles.videoOverlay} aria-hidden="true"><SocialPlatformIcon platform={channel} className="size-7 rounded-lg" /><span>{preview.title}</span></div>
              </div>
              <figcaption><strong>{preview.tag}</strong><span>{preview.label}</span></figcaption>
            </figure>)}
          </div>

          <div className={styles.actionRow}>
            <div aria-live="polite"><p className={styles.actionTitle}>{youtube ? "Ready for your next upload?" : "TikTok is on the roadmap."}</p><p>{youtube ? "Review a finished video, then upload or schedule from your workspace. Public posting depends on approval." : "Direct TikTok connection and scheduling are not available yet. Create a video to export in the meantime."}</p></div>
            <Link href={youtube ? "/studio/social" : "/studio"} className={styles.cta}>{youtube ? "Open YouTube publishing" : "Explore the studio"}<ArrowRight aria-hidden size={16} /></Link>
          </div>
        </div>
      </div>

      <footer className={styles.footer}><p id="channel-media-note"><CircleHelp aria-hidden size={14} /> AI stock inspiration, not ETA exports. Dashboard is a design preview; no real account statistics or growth guarantees.</p><span><LockKeyhole aria-hidden size={13} /> You stay in control</span></footer>
    </div>
  </section>;
}
