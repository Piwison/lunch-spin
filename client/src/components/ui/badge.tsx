import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A count. The filter trigger's active-filter number, a section header's "3".
 *
 * Not a status and not a tag — StatusChip says what happened, a restaurant's
 * tag chip says what it is; this only ever holds a number, which is why it is
 * tabular and why its small size sits on the 11px eyebrow rung.
 */
const badgeVariants = cva("inline-flex items-center justify-center rounded-chip font-semibold tabular-nums", {
  variants: {
    tone: {
      brand: "bg-(image:--brand-grad) text-on-accent",
      neutral: "bg-muted text-body-warm",
    },
    size: {
      sm: "min-h-(--badge-height) min-w-(--badge-height) px-[5px] text-(length:--badge-label)",
      md: "px-2 py-0.5 type-meta",
    },
  },
  defaultVariants: { tone: "brand", size: "sm" },
});

function Badge({ className, tone, size, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, size, className }))} {...props} />;
}

export { Badge, badgeVariants };
