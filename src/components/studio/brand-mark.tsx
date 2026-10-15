import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center align-middle", className)}>
      <Image
        src={compact ? "/brand/create-ai-videos-symbol.svg" : "/brand/create-ai-videos-logo.svg"}
        alt={`${brand.name} — AI video studio`}
        width={compact ? 64 : 330}
        height={64}
        className={compact ? "size-10" : "h-auto w-[138px] sm:w-[190px]"}
        loading="eager"
        unoptimized
      />
    </span>
  );
}
