import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/12 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
        success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        destructive: "border-red-400/30 bg-red-400/10 text-red-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
