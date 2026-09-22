import { Sparkles } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-primary shadow-[0_0_24px_-9px_var(--primary)]">
        <Sparkles className="size-4" aria-hidden />
        <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background bg-amber" />
      </span>
      {!compact && <span className="text-[0.9375rem] font-bold tracking-[-0.02em]">{brand.name}</span>}
    </div>
  );
}
