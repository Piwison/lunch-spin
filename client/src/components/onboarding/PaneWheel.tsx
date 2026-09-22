import { forwardRef, useEffect, useRef, useState } from "react";

/**
 * The wheel the first-run list is building, drawn as plain panes.
 *
 * One pane per place that will go on the wheel, so ticking a card visibly adds
 * a slice and unticking takes one away — the list and the wheel are the same
 * fact on screen. Each change turns the disc a notch in the direction of the
 * change (added: forward, removed: back); it is a transition, so a burst of
 * taps accumulates rather than restarting.
 *
 * Deliberately unlabelled, for the same reason as LandingWheel: the labels on a
 * disc are the most-rebuilt part of this product (failure modes 16/43/44/51b),
 * and at 44px or 200px no name would fit anyway. The list beside it names them.
 *
 * Two tones. `paper` sits on the page, with opaque --paper/--muted panes and a
 * real --border rim (failure mode 29: white on white reads as nothing). `accent`
 * sits inside the persimmon commit button, where --on-accent panes with
 * transparent gaps let the persimmon show through as the dividers.
 */

const NOTCH_DEG = 24;

export type PaneWheelTone = "paper" | "accent";

function paneBackground(count: number, tone: PaneWheelTone): string {
  const heavy = tone === "paper" ? "var(--paper)" : "var(--on-accent)";
  const light =
    tone === "paper"
      ? "var(--muted)"
      : "oklch(from var(--on-accent) l c h / 0.55)";
  const gap = tone === "paper" ? "var(--border)" : "transparent";
  const hub =
    tone === "paper"
      ? "radial-gradient(closest-side, var(--paper) 0 21%, var(--border) 21% 24%, transparent 24.5%)"
      : "radial-gradient(closest-side, var(--brand-solid) 0 20%, var(--on-accent) 20% 27%, transparent 27.5%)";

  if (count <= 0) {
    const empty =
      tone === "paper"
        ? "var(--muted)"
        : "oklch(from var(--on-accent) l c h / 0.3)";
    return `${hub}, ${empty}`;
  }
  if (count === 1) return `${hub}, ${heavy}`;

  // An odd count would put two heavy panes side by side at the seam and the
  // disc reads one slice short (three panes looked like two), so the last pane
  // of an odd count takes a third tone between the other two.
  const middle =
    tone === "paper"
      ? "color-mix(in oklab, var(--paper), var(--muted))"
      : "oklch(from var(--on-accent) l c h / 0.78)";
  const step = 360 / count;
  const stops = Array.from({ length: count }, (_, i) => {
    const fill =
      count % 2 === 1 && i === count - 1 ? middle : i % 2 === 0 ? heavy : light;
    return `${fill} ${i * step}deg ${(i + 1) * step}deg`;
  }).join(", ");
  const gapDeg = tone === "paper" ? 1.4 : 3;
  return [
    hub,
    `repeating-conic-gradient(from ${-step / 2}deg, ${gap} 0deg ${gapDeg}deg, transparent ${gapDeg}deg ${step}deg)`,
    `conic-gradient(from ${-step / 2}deg, ${stops})`,
  ].join(", ");
}

const PaneWheel = forwardRef<
  HTMLDivElement,
  { count: number; size: number; tone?: PaneWheelTone; className?: string }
>(function PaneWheel({ count, size, tone = "paper", className = "" }, ref) {
  const n = Math.max(0, Math.floor(count));
  const last = useRef(n);
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (n === last.current) return;
    setTurn(deg => deg + (n > last.current ? NOTCH_DEG : -NOTCH_DEG));
    last.current = n;
  }, [n]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`onb-disc flex-none rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: paneBackground(n, tone),
        boxShadow:
          tone === "paper"
            ? "inset 0 0 0 2px var(--border), 0 16px 36px -18px oklch(from var(--brand) l c h / 0.35)"
            : "inset 0 0 0 1.5px var(--on-accent)",
        transform: `rotate(${turn}deg)`,
      }}
    />
  );
});

export default PaneWheel;
