import { Check, Clock3, MapPin, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

interface WinnerSurfaceProps {
  /** The winning restaurant's name. Set full bleed, with no card around it. */
  name: string;
  /** "Closing in ~N min — hurry!" when the winner is open but not for long. */
  closingSoonMinutes?: number | null;
  isClosingSoon?: boolean;
  /** Walk time and similar. Sits under the name, quiet. */
  meta?: ReactNode;
  /** Page-specific extras: the rating capture and exclusion tip on the app, the
   *  sign-up prompt on the guest wheel. */
  children?: ReactNode;
  onAccept: () => void;
  acceptLabel?: string;
  onRespin: () => void;
  respinDisabled?: boolean;
  onDirections: () => void;
  /** The quiet way out. Distinct from Respin: the spin already stands as
   *  rejected for today, so dismissing means "not this one, not now" without
   *  starting another. Bound to a downward drag, a tap on the ground, and Esc. */
  onDismiss: () => void;
}

/**
 * The result.
 *
 * No card frame and no modal: the camera is still holding its zoom on the wheel
 * behind this, the disc has dropped back and blurred, and the winning pane
 * unrolls in place into display type. A card here would put a border around the
 * one moment the whole app exists for.
 *
 * Shared by WheelApp and GuestWheel. They previously carried two near-identical
 * copies of this overlay, which is why the guest wheel kept drifting a release
 * behind — the vote-once and read-only rules differ between them, but none of
 * the presentation does.
 */
/** How far the panel has to travel before letting go dismisses it. */
const DISMISS_AFTER_PX = 90;

export default function WinnerSurface({
  name,
  closingSoonMinutes,
  isClosingSoon = false,
  meta,
  children,
  onAccept,
  acceptLabel = "Lock it in",
  onRespin,
  respinDisabled = false,
  onDirections,
  onDismiss,
}: WinnerSurfaceProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  /**
   * Drag down to dismiss.
   *
   * This replaced a 44px [x] pinned to `top: 16px` of a full-screen overlay.
   * That put it under the status bar and the Dynamic Island on every recent
   * iPhone — it was genuinely unreachable, not just awkward — and even with the
   * safe-area inset applied, the top-right corner is the furthest point from a
   * thumb on a big phone. The panel already rises from the bottom, so the
   * gesture that matches it is pushing it back down: it works from anywhere on
   * the panel, no aiming required.
   *
   * Pointer events, not touch: the same code covers trackpad drags, and setting
   * pointer capture means a drag that leaves the element still finishes here.
   */
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    // Let the actions handle their own taps; a drag starts on the panel itself.
    if ((e.target as HTMLElement).closest("button, a")) return;
    dragFrom.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragFrom.current === null) return;
    // Downward only. Rubber-band upward pulls to nothing rather than lifting the
    // panel off the bottom of the screen.
    setDragY(Math.max(0, e.clientY - dragFrom.current));
  };
  const endDrag = () => {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    // A short flick is a mis-grab, not a dismiss.
    if (dragY > DISMISS_AFTER_PX) onDismiss();
    setDragY(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Spin result: ${name}`}
      onClick={onDismiss}
      style={{
        // A scrim, not a backdrop: the ground fades up from the bottom so the
        // actions have something to sit on, while the top stays clear and the
        // zoomed wheel keeps showing through. The ground never blurs, so this
        // carries no backdrop-filter of its own — the disc does its own
        // receding behind it.
        backgroundImage:
          "linear-gradient(to top, var(--background) 22%, oklch(from var(--background) l c h / 0.82) 46%, transparent 78%)",
      }}
    >
      {/* Two nested boxes on purpose. `animate-unroll` animates `transform`, and
          a CSS animation beats an inline style on the same property — putting
          the drag offset on the animated element made the panel dismiss
          correctly while never visibly following the finger, which is the worst
          of both. The outer box owns the drag, the inner one owns the entrance. */}
      <div
        className="w-full touch-none"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          // No transition while the finger is down — the panel tracks the drag
          // 1:1 — and a spring back to zero when it lifts.
          transition: dragFrom.current === null ? "transform var(--dur-sheet-out) var(--ease-settle)" : "none",
        }}
      >
      <div
        className="px-6 flex flex-col items-start gap-5 w-full max-w-lg mx-auto animate-unroll"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        {/* Grabber. Says "this can be pushed down" without a label, and gives
            the gesture a visible home even though it works anywhere. */}
        <div
          aria-hidden="true"
          className="self-center"
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            marginBottom: 4,
            background: "var(--border)",
            opacity: 0.9,
          }}
        />
        <div className="w-full">
          <p className="type-eyebrow mb-3" style={{ color: "var(--brand-text)" }}>
            Today&apos;s lunch
          </p>
          {/* Full bleed, no frame. --accent-ink is the accent tuned for text on
              light glass; in dark it resolves to the accent itself. */}
          <h2 className="type-display" style={{ color: "var(--accent-ink)" }}>
            {name}
          </h2>
          {meta && (
            <div className="type-meta mt-4" style={{ color: "var(--body)" }}>
              {meta}
            </div>
          )}
        </div>

        {isClosingSoon && (
          <div
            className="glass-chip flex items-center gap-2 px-4 py-3 w-full"
            style={{ color: "var(--destructive)" }}
          >
            <Clock3 size={15} className="flex-shrink-0" />
            <span className="type-meta font-semibold">
              {closingSoonMinutes != null
                ? `Closing in ~${closingSoonMinutes} min — hurry!`
                : "Closing soon — hurry!"}
            </span>
          </div>
        )}

        {children}

        <div className="flex flex-col gap-2.5 w-full">
          <button
            autoFocus
            onClick={onAccept}
            className="w-full flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[var(--press-scale)]"
            style={{
              minHeight: 56,
              borderRadius: "var(--radius-control)",
              background: "var(--brand-solid)",
              color: "var(--on-accent)",
              fontSize: 17,
              transitionDuration: "var(--dur-tap)",
            }}
          >
            <Check size={18} /> {acceptLabel}
          </button>
          <div className="flex gap-2.5">
            <button
              onClick={onRespin}
              disabled={respinDisabled}
              className="glass-chip flex-1 flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[var(--press-scale)] disabled:opacity-40"
              style={{
                minHeight: 56,
                borderRadius: "var(--radius-control)",
                color: "var(--foreground)",
                fontSize: 15,
                transitionDuration: "var(--dur-tap)",
              }}
            >
              <RotateCw size={16} /> Respin
            </button>
            <button
              onClick={onDirections}
              className="glass-chip flex-1 flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[var(--press-scale)]"
              style={{
                minHeight: 56,
                borderRadius: "var(--radius-control)",
                color: "var(--foreground)",
                fontSize: 15,
                transitionDuration: "var(--dur-tap)",
              }}
            >
              <MapPin size={16} /> Directions
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
