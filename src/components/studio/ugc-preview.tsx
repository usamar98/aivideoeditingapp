import { ExampleVisual } from "@/components/marketing/example-visual";

/** Fictional presenter/product concept, not generated footage or a testimonial. */
export function UgcPreview({ compact = false }: { compact?: boolean }) {
  return <ExampleVisual variant="ugc" className={compact ? "md:h-full" : undefined} />;
}
