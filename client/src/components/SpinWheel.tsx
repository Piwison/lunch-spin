import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  EASE_DECAY,
  EASE_EXIT,
  EASE_SETTLE,
  EASE_STANDARD,
  SPIN_TIMELINE,
  labelFrameWidthPx,
  labelMaxWidthPx,
  landingRotationDeg,
  paneCenterDeg,
  panes,
  restingLabelRadiusPx,
} from "@shared/wheelGeometry";
import { useReducedMotion } from "@/hooks/useReducedMotion";

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

/** Degrees the disc counter-rotates on the wind-up, before it releases. */
const WINDUP_DEG = 14;

/** Constant free-spin speed, deg/ms (~4 turns/s). */
const FREE_SPIN_SPEED = 1.49;

/** Whole turns the landing must cover, so the stop reads as a decision. */
const MIN_LAND_TURNS = 5;

/**
 * The final arc handed to the settle, where the overshoot lives.
 *
 * Kept well under a half-pane (22.5° at eight places) so the bounce never
 * carries the pointer off the winning pane and back — the wheel wavers between
 * two panes during the decay, which is intended, but once it has landed it has
 * landed.
 */
const SETTLE_DEG = 12;

/** Floor on the deceleration when the server answers late. Without it a slow
 *  spins.create would leave no room to slow down and the wheel would stop dead. */
const MIN_DECAY_MS = 1200;

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
  const lastRef = useRef(0);
  const reducedMotion = useReducedMotion();

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

    const startedAt = performance.now();
    const startAngle = angleRef.current;

    // Resolved once the server names a winner. Until then the wheel free-spins:
    // the client never picks, it only keeps turning.
    let decayFrom = 0;
    let decayFromAngle = 0;
    let decayMs = 0;
    let settleFromAngle = 0;
    let targetAngle = 0;
    let landSegment: WheelSegment | null = null;
    let phase: "windup" | "free" | "decay" | "settle" = "windup";

    const beginDecay = (now: number) => {
      const segs = segmentsRef.current;
      const tId = targetIdRef.current;
      const idx = tId == null ? -1 : segs.findIndex((s) => s.id === tId);
      const targetIndex = idx >= 0 ? idx : Math.floor(Math.random() * segs.length);
      landSegment = segs[targetIndex] ?? null;

      decayFromAngle = angleRef.current;
      targetAngle = landingRotationDeg({
        fromDeg: decayFromAngle,
        targetIndex,
        count: segs.length,
        pointerDeg: POINTER_DEG,
        minTurns: MIN_LAND_TURNS,
      });
      settleFromAngle = targetAngle - SETTLE_DEG;

      // Travel is 2600ms of wall clock, not 2600ms of animation queued behind a
      // network call: whatever the server has already spent free-spinning counts
      // against it. A fast reply gets the spec timeline exactly; a cold start
      // keeps turning and still gets a real deceleration.
      const travelEndsAt = startedAt + SPIN_TIMELINE.windupMs + SPIN_TIMELINE.travelMs;
      decayMs = Math.max(MIN_DECAY_MS, travelEndsAt - now);
      decayFrom = now;
      phase = "decay";
    };

    const frame = (now: number) => {
      const elapsed = now - startedAt;

      if (phase === "windup") {
        // The disc loads up backwards before it releases.
        const p = Math.min(elapsed / SPIN_TIMELINE.windupMs, 1);
        applyRotation(startAngle - WINDUP_DEG * EASE_EXIT(p));
        if (p >= 1) phase = "free";
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (phase === "free") {
        applyRotation(angleRef.current + FREE_SPIN_SPEED * (now - lastRef.current));
        lastRef.current = now;
        if (targetIdRef.current != null) beginDecay(now);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (phase === "decay") {
        const p = Math.min((now - decayFrom) / decayMs, 1);
        applyRotation(
          decayFromAngle + (settleFromAngle - decayFromAngle) * EASE_DECAY(p)
        );
        if (p >= 1) {
          phase = "settle";
          decayFrom = now;
        }
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const p = Math.min((now - decayFrom) / SPIN_TIMELINE.settleMs, 1);
      // EASE_SETTLE is the one curve allowed past 1: the disc nudges beyond the
      // pointer and comes back, which is what makes the stop feel physical.
      applyRotation(settleFromAngle + SETTLE_DEG * EASE_SETTLE(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        applyRotation(targetAngle);
        if (landSegment) onSpinEndRef.current(landSegment);
      }
    };

    // Reduced motion: no wind-up, no overshoot, no theatre. 400ms straight to
    // the same answer — and it still waits for the server to give it.
    const reducedFrame = (now: number) => {
      if (targetIdRef.current == null && landSegment == null) {
        rafRef.current = requestAnimationFrame(reducedFrame);
        return;
      }
      if (landSegment == null) {
        beginDecay(now);
        decayFrom = now;
      }
      const p = Math.min((now - decayFrom) / SPIN_TIMELINE.reducedMs, 1);
      applyRotation(decayFromAngle + (targetAngle - decayFromAngle) * EASE_STANDARD(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(reducedFrame);
      } else {
        applyRotation(targetAngle);
        if (landSegment) onSpinEndRef.current(landSegment);
      }
    };

    lastRef.current = startedAt;
    rafRef.current = requestAnimationFrame(reducedMotion ? reducedFrame : frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isSpinning, reducedMotion]);

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
