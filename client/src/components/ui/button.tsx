import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The Ember button. Every action in the app is one of these.
 *
 * This file used to be stock shadcn — 36px tall, a 6px radius, a flat
 * `bg-primary` — and not one call site used it as it came: each `<Button>`
 * overrode its height, radius, fill, label size and tracking inline, and ~40
 * more actions skipped it entirely and hand-rolled the same recipe on a raw
 * `<button>`. So the recipe lives here now, drawn from the component tokens in
 * index.css, and a call site only says WHICH button it wants.
 *
 * Variants are roles, not colours:
 *   primary              the persimmon action. One per view.
 *   secondary            solid paper with a hairline — an action on the bare ground.
 *   outline              a hairline and no fill — an action ON glass. The sheet is
 *                        the material, so a control on it is drawn with a line,
 *                        never a second translucent panel (failure mode 35).
 *   brand-outline        a persimmon hairline — a secondary action that still
 *                        belongs to the brand ("Add" beside a field).
 *   ghost                no edge at all — "other", "cancel", tertiary ways out.
 *   positive             the ok tint — putting something back (re-enable).
 *   destructive          the one filled red — confirming a delete.
 *   destructive-outline  a red hairline — offering a delete, one step before.
 *   link                 inline text.
 *
 * Sizes are the two control heights: `lg` 56 (the spec's minimum for an
 * action) and `md` 44 (the tap-target floor), plus square icon versions.
 *
 * Icons render at the size they are given — except in the icon sizes, where
 * the glyph is part of the control's proportion and is fixed.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 text-center font-medium",
    "rounded-control",
    "transition duration-(--dur-tap) ease-(--ease-standard)",
    "active:scale-(--press-scale)",
    "disabled:pointer-events-none disabled:opacity-(--control-disabled-opacity)",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-(image:--brand-grad) text-on-accent tracking-(--control-tracking) hover:brightness-105",
        secondary: "border border-border bg-paper text-ink-warm hover:bg-accent",
        outline: "border border-border bg-transparent text-ink-warm hover:bg-accent",
        "brand-outline": "border border-brand-solid bg-transparent text-brand-text font-semibold hover:bg-accent",
        ghost: "bg-transparent text-body-warm hover:bg-accent hover:text-ink-warm",
        positive: "border border-ok/40 bg-ok/15 text-ok",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-105",
        "destructive-outline": "border border-destructive/32 bg-transparent text-destructive hover:bg-destructive/8",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        lg: "min-h-(--control-lg) px-6 text-(length:--control-label-md)",
        md: "min-h-(--control-md) px-4 text-(length:--control-label-md)",
        icon: "size-(--control-md) [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-(--control-lg) [&_svg:not([class*='size-'])]:size-5",
      },
    },
    compoundVariants: [
      // A FILLED action — the persimmon one, or the red one that confirms a
      // delete — speaks one rung up at full size.
      { variant: ["primary", "destructive"], size: "lg", className: "text-(length:--control-label-lg)" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  ButtonVariantProps & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "primary"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, type ButtonVariantProps };
