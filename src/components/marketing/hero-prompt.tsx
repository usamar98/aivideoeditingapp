import { ArrowUp, Clapperboard, Compass, Megaphone, Sparkles, Video } from "lucide-react";

const shortcuts = [
  { label: "Create a viral faceless video", icon: Video },
  { label: "Create a viral cartoon", icon: Clapperboard },
  { label: "Create UGC", icon: Megaphone },
  { label: "Explore", icon: Compass },
];

/** Visual prompt preview only; creation still starts from a feature page. */
export function HeroPrompt() {
  return <div className="mx-auto mt-8 w-full max-w-[820px]" data-testid="hero-prompt">
    <div className="flex h-44 flex-col rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_50px_-18px_rgba(24,45,78,0.3)] sm:rounded-[32px] sm:p-6">
      <textarea
        aria-label="Example video prompt"
        aria-describedby="hero-prompt-note"
        readOnly
        rows={3}
        value="Create a video about your next big idea…"
        className="h-20 min-h-20 w-full shrink-0 resize-none overflow-y-auto border-0 bg-transparent text-base leading-7 text-slate-500 outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <div className="mt-auto flex items-center justify-between gap-3">
        <span id="hero-prompt-note" className="inline-flex items-center gap-2 text-xs text-slate-500"><Sparkles aria-hidden className="size-4 text-primary" /> Prompt preview</span>
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-400"><ArrowUp className="size-5" /></span>
      </div>
    </div>
    <nav aria-label="Explore creation tools" className="mt-4 flex flex-wrap justify-center gap-2.5">
      {shortcuts.map(({ label, icon: Icon }) => <a key={label} href="#tools" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:text-sm">
        <Icon aria-hidden className="size-4 shrink-0 text-primary" />{label}
      </a>)}
    </nav>
  </div>;
}
