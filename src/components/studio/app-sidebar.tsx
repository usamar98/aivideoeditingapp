import Link from "next/link";
import { Clapperboard, FolderKanban, UserRound, WandSparkles, Video, ListChecks } from "lucide-react";

import { BrandMark } from "./brand-mark";

const items = [
  { href: "/studio", label: "Projects", icon: FolderKanban },
  { href: "/studio/faceless", label: "Faceless videos", icon: Video },
  { href: "/studio/jobs", label: "Jobs", icon: ListChecks },
  { href: "/studio/cartoons", label: "Cartoon videos", icon: Clapperboard },
  { href: "/features/ai-cartoon-series", label: "Feature page", icon: WandSparkles },
];

export function AppSidebar({ active = "Episode editor" }: { active?: string }) {
  return (
    <aside className="hidden w-[4.5rem] shrink-0 flex-col items-center border-r border-border bg-card/70 py-4 backdrop-blur-xl md:flex">
      <Link href="/" aria-label="Home"><BrandMark compact /></Link>
      <nav className="mt-10 flex flex-1 flex-col gap-2" aria-label="Workspace">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.label === active;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={selected ? "page" : undefined}
              className={`grid size-10 place-items-center rounded-lg transition-colors ${selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <Icon className="size-[1.125rem]" />
            </Link>
          );
        })}
      </nav>
      <Link href="/studio/profile" aria-label="My account" title="My account" className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
        <UserRound className="size-[1.125rem]" />
      </Link>
    </aside>
  );
}
