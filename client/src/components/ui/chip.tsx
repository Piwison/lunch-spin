import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A toggle you can see the state of: a tag filter, a cuisine craving.
 *
 * Off is OUTLINED, not filled. Chips mostly sit on a glass sheet, and a
 * translucent fill on translucent glass has nothing behind it to refract — it
 * reads as a second flat panel with an invisible border (failure mode 35). On
 * lights persimmon, because it is a choice the person made.
 *
 * `pressed` is required and is what drives both the look and `aria-pressed`,
 * so the state a screen reader hears can never disagree with the one on
 * screen — the filter sheet's chips used to carry the colour and not the
 * attribute.
 */
function Chip({
  pressed,
  className,
  type = "button",
  ...props
}: Omit<React.ComponentProps<"button">, "aria-pressed"> & { pressed: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      data-slot="chip"
      data-state={pressed ? "on" : "off"}
      className={cn(
        "inline-flex min-h-(--control-md) items-center justify-center gap-1.5 rounded-chip border px-4",
        "text-(length:--control-label-md) font-medium",
        "transition duration-(--dur-tap) ease-(--ease-standard) active:scale-(--press-scale)",
        "disabled:pointer-events-none disabled:opacity-(--control-disabled-opacity)",
        pressed
          ? "border-transparent bg-(image:--brand-grad) text-on-accent"
          : "border-border bg-transparent text-body-warm hover:text-ink-warm",
        className,
      )}
      {...props}
    />
  );
}

export { Chip };
