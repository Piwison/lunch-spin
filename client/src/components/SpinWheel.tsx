import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  labelFrameWidthPx,
  labelMaxWidthPx,
  landingRotationDeg,
  paneCenterDeg,
  panes,
  restingLabelRadiusPx,
} from "@shared/wheelGeometry";

export interface WheelSegment {
  id: number;
  label: string;
  /** The restaurant's tag colour. The Ember wheel is colourless glass and does
   *  not use it, but it still drives the Places-tab dots and the result, so it
   *  stays on the type rather than being threaded separately. */
  color: string;
}

interface SpinWheelProps {
  segments: WheelSegment[];
  onSpinEnd: (segment: WheelSegment) => void;
  isSpinning: boolean;
  onSpinStart: () => void;
  targetId?: number | null;
}

/** Resting pointer sits on the left rim, pointing in. 0° is 3 o'clock. */
const POINTER_DEG = 180;

/**
 * The disc is oversized and breaks the right edge — the signature motif.
 *
 * How far it may break is bounded by item 5's other condition, "no clipped
 * label". Those two pull against each other: at the full 1.9×-style overhang the
 * 3 o'clock label lands at x=311 in a 320px frame and is guillotined mid-word,
 * which reads as a bug rather than as a disc continuing past the screen. So the
 * overhang is real but modest — the disc still runs past the right edge, it just
 * does not take a name with it. The zoom camera (item 7) is where the disc
 * genuinely breaks both edges, and there labels are culled by angle instead.
 */
const DISC_TO_FRAME = 1.06;
const DISC_CENTER_X = 0.54;

/** Deceleration easing: ease-out-quart. Its initial slope is 4, which the
 *  landing duration uses to velocity-match the hand-off from the free-spin so
 *  there is no visible lurch when the winner arrives. */
const EASE_OUT_QUART = (p: number) => 1 - Math.pow(1 - p, 4);
const LAND_EASE_SLOPE = 4;
const FREE_SPIN_SPEED = 1.49; // deg/ms constant free-spin (~4 turns/s)
const MIN_LAND_TURNS = 2;

/**
 * The Ember wheel.
 *
 * Rendered as DOM rather than canvas. The disc is a conic-gradient, the labels
 * are elements, and the whole thing turns on a single `--rot` custom property:
 * one style write per frame drives the disc, the label ring and every label's
 * counter-rotation together, and the browser composites it on the GPU instead of
 * repainting a canvas. That is also what makes per-label blur affordable in the
 * zoom (item 7) — it is one CSS filter per element rather than a `ctx.filter`
 * repaint per label per frame.
 *
 * Labels stay horizontal here. Rotation is scoped to the zoomed state only.
 */
export default function SpinWheel({ segments, onSpinEnd, isSpinning, targetId }: SpinWheelProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const angleRef = useRef(0);
  const rafRef = useRef(0);

  // Latest props mirrored into refs so the spin loop can read them without
  // listing them as effect dependencies — otherwise every unrelated re-render
  // (shared-wheel polling) would restart the spin and it would never stop.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;
  const targetIdRef = useRef(targetId);
  targetIdRef.current = targetId;

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The single write that turns the wheel. */
  const applyRotation = (deg: number) => {
    angleRef.current = deg;
    rotRef.current?.style.setProperty("--rot", `${deg}deg`);
  };

  useEffect(() => {
    if (!isSpinning || segmentsRef.current.length === 0) return;

    let landing = false;
    let landStart = 0;
    let landFrom = 0;
    let landTo = 0;
    let landDuration = 0;
    let landSegment: WheelSegment | null = null;
    let last = performance.now();

    const beginLanding = (now: number) => {
      const segs = segmentsRef.current;
      const tId = targetIdRef.current;
      const idx = tId == null ? -1 : segs.findIndex((s) => s.id === tId);
      const targetIndex = idx >= 0 ? idx : Math.floor(Math.random() * segs.length);
      landSegment = segs[targetIndex] ?? null;
      landFrom = angleRef.current;
      landTo = landingRotationDeg({
        fromDeg: landFrom,
        targetIndex,
        count: segs.length,
        pointerDeg: POINTER_DEG,
        minTurns: MIN_LAND_TURNS,
      });
      // Duration chosen so the easing's initial velocity equals the speed the
      // wheel was already turning at, so the deceleration begins without a jump.
      landDuration = (LAND_EASE_SLOPE * (landTo - landFrom)) / FREE_SPIN_SPEED;
      landStart = now;
      landing = true;
    };

    const frame = (now: number) => {
      if (!landing) {
        applyRotation(angleRef.current + FREE_SPIN_SPEED * (now - last));
        last = now;
        if (targetIdRef.current != null) beginLanding(now);
        rafRef.current = requestAnimationFrame(frame);
      } else {
        const p = Math.min((now - landStart) / landDuration, 1);
        applyRotation(landFrom + (landTo - landFrom) * EASE_OUT_QUART(p));
        if (p < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          applyRotation(landTo);
          if (landSegment) onSpinEndRef.current(landSegment);
        }
      }
    };

    if (targetIdRef.current != null) beginLanding(performance.now());
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isSpinning]);

  const count = segments.length;
  const discPx = Math.max(frameW * DISC_TO_FRAME, 1);
  const centerX = frameW * DISC_CENTER_X;
  const labelRadius = restingLabelRadiusPx(discPx, Math.max(count, 1));
  // Spec sets the resting label at 15px. Narrower wedges get a smaller size so a
  // name keeps a few more characters before the ellipsis — at 12 places the
  // wedge simply is not wide enough for a full name, and the zoom is where the
  // names become legible (headline-sized, one at a time).
  const labelSize = count <= 8 ? 15 : count <= 10 ? 13 : 12;

  // Alternating colourless glass panes. Two stops per pane so each is a hard
  // edge, plus a hairline of separation drawn between them.
  const conic = count
    ? `conic-gradient(${panes(count)
        .map(
          (p) =>
            `var(${p.heavy ? "--pane-heavy" : "--pane-light"}) ${p.startDeg}deg ${p.endDeg}deg`
        )
        .join(", ")})`
    : "conic-gradient(var(--pane-light) 0deg 360deg)";

  const separators = count
    ? `repeating-conic-gradient(var(--wheel-hairline) 0deg 0.35deg, transparent 0.35deg ${360 / count}deg)`
    : "none";

  return (
    <div
      ref={frameRef}
      className="relative w-full"
      style={{ height: discPx || undefined, ["--disc" as string]: `${discPx}px` }}
    >
      {frameW > 0 && (
        <>
          {/* The disc. Everything that turns lives under one --rot write. */}
          <div
            ref={rotRef}
            className="absolute top-0"
            style={{
              width: discPx,
              height: discPx,
              left: centerX - discPx / 2,
              ["--rot" as string]: "0deg",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                transform: "rotate(var(--rot))",
                backgroundImage: `${separators}, ${conic}`,
                boxShadow: "var(--wheel-shadow), inset 0 0 0 1px var(--glass-card-border)",
              }}
            />

            {/* Warm highlight. A lighting effect on the frame, not on the disc,
                so it stays put while the wheel turns underneath it. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                backgroundImage: "var(--wheel-highlight)",
              }}
            />

            {/* Labels ride the same --rot and counter-rotate to stay horizontal. */}
            <div className="absolute inset-0" style={{ transform: "rotate(var(--rot))" }}>
              {segments.map((seg, i) => {
                const centerDeg = paneCenterDeg(i, count);
                // Bounded by the disc it sits on AND by the visible frame the
                // disc runs past — whichever bites first.
                const maxWidth = Math.min(
                  labelMaxWidthPx(centerDeg, labelRadius, discPx, count),
                  labelFrameWidthPx(centerDeg, labelRadius, centerX, frameW)
                );
                return (
                  <div
                    key={seg.id}
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `rotate(${centerDeg}deg) translateX(${labelRadius}px) rotate(${-centerDeg}deg) rotate(calc(-1 * var(--rot)))`,
                    }}
                  >
                    <span
                      className="block -translate-x-1/2 -translate-y-1/2 text-center whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{
                        maxWidth,
                        fontSize: labelSize,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                        color: "var(--foreground)",
                      }}
                    >
                      {seg.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hub — glass, with the count that is actually in play. */}
            <div
              className="glass-chip absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex flex-col items-center justify-center"
              style={{ width: discPx * 0.26, height: discPx * 0.26 }}
            >
              <span
                style={{ fontSize: discPx * 0.1, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--ink-strong)" }}
              >
                {count}
              </span>
              <span className="type-eyebrow mt-1" style={{ color: "var(--brand)" }}>
                in play
              </span>
            </div>
          </div>

          {/* Pointer, and the fixed sensing zone behind it. Neither turns. */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              left: centerX - discPx / 2,
              top: discPx / 2,
              width: discPx * 0.2,
              height: 64,
              transform: "translateY(-50%)",
              background:
                "linear-gradient(90deg, oklch(from var(--brand) l c h / .18), transparent)",
              borderRadius: "0 999px 999px 0",
            }}
          />
          <div
            className="absolute z-20"
            style={{ left: Math.max(centerX - discPx / 2, 2), top: discPx / 2, transform: "translateY(-50%)" }}
          >
            <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
              <path
                d="M27 13L4 2.5L4 23.5Z"
                fill="var(--brand)"
                stroke="var(--paper)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {count === 0 && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center px-6"
              style={{ left: centerX }}
            >
              <p className="type-meta" style={{ color: "var(--muted-foreground)" }}>
                Add restaurants
                <br />
                to spin the wheel
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
