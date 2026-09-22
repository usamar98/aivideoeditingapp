import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-lg border border-input bg-background/70 px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
