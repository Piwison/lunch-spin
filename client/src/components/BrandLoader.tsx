/**
 * The one loading indicator for the whole app: the lunch-wheel brand mark
 * (.orb-wheel) spinning at loading speed. Used for route-chunk loading, the
 * auth check, and the wheel-picking phase so those sequential states share one
 * visual and never "swap" between a gradient blob, the wheel orb, and a gray
 * circle (the old janky first-load sequence).
 *
 * .animate-orb-spin is 28s by default (ambient rotation in the header/hero);
 * we override animation-duration inline so it reads as an active spinner here.
 * prefers-reduced-motion still zeroes the animation (index.css) — the label
 * carries the "loading" meaning in that case.
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
        style={{
          width: size,
          height: size,
          animationDuration: "1.4s",
          boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
        }}
      />
      {label ? (
        <p className="text-sm text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
          {label}
        </p>
      ) : null}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center fade-in" style={{ background: "var(--background)" }}>
        {orb}
      </div>
    );
  }
  return orb;
}
