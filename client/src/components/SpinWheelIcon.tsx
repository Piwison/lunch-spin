/**
 * The Wheel tab's icon — a prize wheel under its pointer.
 *
 * It used to be lucide's `RotateCw`, which is a circular arrow: the universal
 * glyph for refresh, reload and undo. In a bottom dock next to a fork and a
 * clock it reads as "reset the page", not "the wheel", and that is what it was
 * doing on the app's most important tab.
 *
 * Drawn rather than borrowed, because no icon set has this. Three decisions,
 * all made by looking at it at 20px, which is the only size that matters here:
 *
 *   · SIX spokes, not eight. The real wheel's pane count varies, but past six
 *     the lines converge into a blot at tab size.
 *   · The spokes stop short of the centre and a filled hub sits in the gap.
 *     Without it the six strokes meet at a point and clog; with it the middle
 *     reads as the axle the resting wheel actually has.
 *   · The pointer is a filled triangle biting the top of the rim, the same
 *     relationship the wheel itself uses. It is what separates this from a pie
 *     chart, and it survives to the smallest size because it is solid.
 *
 * Stroke-based and `currentColor` throughout, so it sits beside the lucide
 * icons in the same row and inverts on the persimmon pill for free.
 */
export function SpinWheelIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.4 9.9 1.6h4.2Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.2" r="8.3" />
      <path d="M14.4 13.2 20.3 13.2M13.2 15.28 16.15 20.39M10.8 15.28 7.85 20.39M9.6 13.2 3.7 13.2M10.8 11.12 7.85 6.01M13.2 11.12 16.15 6.01" />
      <circle cx="12" cy="13.2" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
