import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimeArt } from "./anime-art";

export function AnimePreviewCard() {
  return <article data-feature="anime-studio-preview" data-availability="static-preview" className="overflow-hidden rounded-2xl border border-border bg-card">
    <Link href="/studio/anime" aria-label="Anime Studio" className="group flex h-full flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
      <div className="relative aspect-video overflow-hidden bg-[#142c57]">
        <AnimeArt className="size-full"/>
        <span className="absolute top-3 left-3 rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">Static preview · No credits used</span>
        <span className="absolute right-3 bottom-3 rounded-full bg-white/90 p-2 text-primary"><ArrowUpRight className="size-4" aria-hidden="true"/></span>
      </div>
      <h2 className="p-6 text-xl font-semibold group-hover:text-primary">Anime Studio</h2>
    </Link>
  </article>;
}
