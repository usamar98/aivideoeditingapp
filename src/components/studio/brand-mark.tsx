import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center align-middle", className)}>
      <Image
        src={compact ? "/brand/eta-symbol.svg" : "/brand/eta-logo.svg"}
        alt={`${brand.name} — AI video studio`}
        width={compact ? 64 : 216}
        height={64}
        className={compact ? "size-10" : "h-auto w-[112px] sm:w-[135px]"}
        loading="eager"
        unoptimized
      />
    </span>
  );
}
