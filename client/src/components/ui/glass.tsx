import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * The four Ember glass surfaces — the only glass in the app.
 *
 * Glass is for floating chrome and overlays: the tab dock, filter chips, sheets,
 * the wheel hub, the result card. The ground stays flat paper and never blurs.
 *
 * These components deliberately hold no `backdrop-filter` of their own. Each one
 * applies a class whose recipe lives in index.css, so the blur radius, fill and
 * hairline for a surface are declared exactly once and both themes stay in step.
 * If a surface here does not fit, the answer is to adjust the recipe — not to
 * hand-roll a `backdropFilter` at the call site, which is how an app ends up with
 * five nearly-identical glasses and a frame budget nobody can account for.
 *
 * Nesting: index.css drops the blur on any glass sitting three or more levels
 * deep, so stacking cannot quietly exceed the two-layer budget.
 */

type GlassProps<T extends ElementType> = {
  /** Render as a different element — `nav`, `aside`, `button`, … Defaults per surface. */
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

function makeSurface(surfaceClass: string, defaultTag: ElementType) {
  return function Surface<T extends ElementType = typeof defaultTag>({
    as,
    className,
    children,
    ...rest
  }: GlassProps<T>) {
    const Tag = (as ?? defaultTag) as ElementType;
    return (
      <Tag className={cn(surfaceClass, className)} {...rest}>
        {children}
      </Tag>
    );
  };
}

/** Floating bar / dock — the tab dock, the app header. Blur 28px, saturate 1.4. */
export const GlassBar = makeSurface("glass-bar", "div");

/** Sheet — bottom sheets and modals. The heaviest blur (34px); radius 34. */
export const GlassSheet = makeSurface("glass-sheet", "div");

/** Card — the result card and any floating panel. Blur 28px, radius 28, lifted. */
export const GlassCard = makeSurface("glass-card", "div");

/** Chip — filter chips and small pills. Blur 24px light, none in dark; radius 19. */
export const GlassChip = makeSurface("glass-chip", "div");
