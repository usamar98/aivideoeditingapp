import Image from "next/image";
import { cn } from "@/lib/utils";

export const exampleVisuals = {
  faceless: {
    src: "/examples/faceless-space.webp",
    alt: "AI-generated concept: an astronaut on cream-colored dunes beneath an enormous blue planet",
  },
  cartoon: {
    src: "/examples/cartoon-forest.webp",
    alt: "AI-generated concept: a fox explorer and friendly robot discover a glowing butterfly in a magical forest",
  },
  ugc: {
    src: "/examples/presenter-product.webp",
    alt: "AI-generated ad concept: a fictional presenter beside unbranded blue skincare products",
  },
} as const;

/** Original AI concept artwork, not a customer project or an ETA video export. */
export function ExampleVisual({
  variant,
  label,
  className,
  sizes = "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 600px",
  disclosure = true,
  loading = "lazy",
}: {
  variant: keyof typeof exampleVisuals;
  label?: string;
  className?: string;
  sizes?: string;
  disclosure?: boolean;
  loading?: "eager" | "lazy";
}) {
  const visual = exampleVisuals[variant];
  return (
    <div className={cn("relative isolate aspect-video overflow-hidden bg-[#162a49]", className)}>
      <Image src={visual.src} alt={visual.alt} fill sizes={sizes} loading={loading} className="object-cover" />
      {label && <span className="absolute left-4 top-4 rounded-full bg-[#faf7ef]/95 px-3 py-1.5 text-xs font-medium text-[#123456]">{label}</span>}
      {disclosure && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-10"><span className="text-[10px] font-medium uppercase tracking-[.12em] text-white">AI-generated concept</span></div>}
    </div>
  );
}
