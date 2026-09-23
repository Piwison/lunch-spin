import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's DEFAULT theme, so it cannot tell that
 * `rounded-control` is a border radius — `cn("rounded-control", "rounded-full")`
 * kept both and whichever came later in the stylesheet won. The radius names
 * below are the `--radius-*` tokens in index.css's @theme; teaching them here
 * is what lets a call site override a component's radius at all.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["chip", "control", "card", "sheet"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
