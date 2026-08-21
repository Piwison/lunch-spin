/**
 * The one loading indicator for the whole app: the lunch-wheel brand mark
 * (.orb-wheel) spinning at loading speed. Used for route-chunk loading, the
 * auth check, and the wheel-picking phase so those sequential states share one
 * visual and never "swap" between a gradient blob, the wheel orb, and a gray
 * circle (the old janky first-load sequence).
 *
 * .animate-orb-spin now runs at loading speed by default — it is only ever a
 * loading indicator, since the ambient header/hero rotations were removed for
 * the performance budget's 0-idle-frames rule. prefers-reduced-motion still
 * zeroes the animation (index.css); the label carries the meaning in that case.
 */
export default function BrandLoader({
  label = "LOADING…",
  size = 48,
  fullscreen = false,
}: {
  label?: string;
  size?: number;
  fullscreen?: boolean;
}) {
  const orb = (
    <div className="flex flex-col items-center gap-4">
      <div
        className="orb-wheel animate-orb-spin"
        style={{ width: size, height: size }}
      />
      {label ? (
        <p className="type-meta" style={{ color: "var(--body-warm)" }}>
          {label}
        </p>
      ) : null}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center fade-in" style={{ background: "var(--ground)" }}>
        {orb}
      </div>
    );
  }
  return orb;
}
