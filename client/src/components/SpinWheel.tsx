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
  visibleLabels,
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
  /**
   * Whether the camera is pushed into the wheel.
   *
   * Owned by the parent, not inferred here: the zoom starts on spin and HOLDS
   * through the landed result until Lock it in or Respin, so it spans two states
   * the wheel does not know about. One owner, one fact — AGENTS.md failure mode
   * 14 is what happens when two effects each decide this for themselves.
   */
  zoomed?: boolean;
  /** The pane that won, once the wheel has landed. Takes the persimmon wash. */
  winnerId?: number | null;
  /** The result is up: the disc drops back and blurs behind the display type. */
  receded?: boolean;
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

/** Zoomed disc diameter, as a multiple of the frame width (spec §4). */
const ZOOM_DISC_TO_FRAME = 1.9;

/** Label ring in the zoomed state: 250px on a 740px disc. */
const ZOOM_LABEL_RATIO = 250 / 370;

/** Where the pointer sits once the camera has pushed in — top centre. */
const ZOOM_POINTER_Y = 44;

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
export default function SpinWheel({
  segments,
  onSpinEnd,
  isSpinning,
  targetId,
  zoomed = false,
  winnerId = null,
  receded = false,
}: SpinWheelProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const angleRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const speedRef = useRef(0);
  const zoomedRef = useRef(zoomed);
  const zoomScaleRef = useRef(1);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  /**
   * The single write that turns the wheel.
   *
   * One custom property drives the disc, the label ring and every label's
   * counter-rotation. In the zoomed state it also repaints the per-label blur —
   * but only for the handful of labels within ±60° of the pointer, because
   * everything else is not in the DOM's way at all.
   */
  const applyRotation = (deg: number) => {
    angleRef.current = deg;
    rotRef.current?.style.setProperty("--rot", `${deg}deg`);
    if (zoomedRef.current) paintLabelBlur(deg);
  };

  /**
   * Per-label motion blur, by angular distance from the pointer.
   *
   * Never applied to the layer: the name under the pointer is always the
   * sharpest thing on screen while the rim smears. Written straight to the DOM
   * rather than through state, because this runs every frame.
   *
   * Blur and type are both inside the scaled camera, so the on-screen 6px the
   * spec asks for is 6/scale locally.
   */
  const paintLabelBlur = (deg: number) => {
    const count = segmentsRef.current.length;
    if (!count) return;
    const speedFactor = Math.max(0, Math.min(speedRef.current / FREE_SPIN_SPEED, 1));
    const shown = new Map(
      visibleLabels(count, deg, POINTER_DEG, speedFactor).map((l) => [l.index, l])
    );
    const scale = zoomScaleRef.current || 1;
    for (let i = 0; i < count; i++) {
      const el = labelRefs.current[i];
      if (!el) continue;
      const l = shown.get(i);
      if (!l) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.filter = l.blurPx > 0.01 ? `blur(${l.blurPx / scale}px)` : "none";
    }
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
        speedRef.current = FREE_SPIN_SPEED;
        applyRotation(angleRef.current + FREE_SPIN_SPEED * (now - lastRef.current));
        lastRef.current = now;
        if (targetIdRef.current != null) beginDecay(now);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (phase === "decay") {
        const p = Math.min((now - decayFrom) / decayMs, 1);
        const next = decayFromAngle + (settleFromAngle - decayFromAngle) * EASE_DECAY(p);
        // Real angular speed, so the blur ramps down with the wheel instead of
        // switching off at the end.
        speedRef.current = Math.abs(next - angleRef.current) / Math.max(now - lastRef.current, 1);
        lastRef.current = now;
        applyRotation(next);
        if (p >= 1) {
          phase = "settle";
          decayFrom = now;
        }
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      speedRef.current = 0;
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

  /**
   * The camera.
   *
   * On spin the wheel stops being an object on screen and becomes something the
   * camera pushes into. Rather than re-deriving every position for a second
   * layout, the whole disc takes one transform whose origin is the pointer
   * contact — the rim point the pane is read at, which is exactly the point that
   * must not move.
   *
   * The 90° rotation is what puts the pointer at top centre without touching the
   * geometry: POINTER_DEG stays 180 everywhere, and the camera turns the frame
   * so that the disc's left becomes the screen's top. The disc centre lands
   * directly below the pointer, which is what makes the hub read as the count
   * sinking below the fold.
   *
   * Scale is against the FRAME width, not the viewport, so a tablet's wheel
   * column zooms against its own column (item 14) rather than the whole screen.
   */
  const zoomScale = discPx > 0 ? (frameW * ZOOM_DISC_TO_FRAME) / discPx : 1;
  const contactX = centerX - discPx / 2;
  const contactY = discPx / 2;
  const active = zoomed && !reducedMotion;
  // The recede is applied outermost so it moves the whole camera back rather
  // than fighting the zoom's transform-origin at the pointer.
  const recede = receded && !reducedMotion ? "translateY(52px) scale(0.94) " : "";
  const camera = active
    ? `${recede}translate(${frameW / 2 - contactX}px, ${ZOOM_POINTER_Y - contactY}px) rotate(90deg) scale(${zoomScale})`
    : recede || "none";
  const zoomLabelRadius = (discPx / 2) * ZOOM_LABEL_RATIO;

  /**
   * Whether the wheel is moving, and therefore whether its layers are worth
   * promoting.
   *
   * The disc's fill is a conic-gradient, and a conic is expensive to rasterise —
   * especially the hairline separator pass, which at twelve places is a 0.35°
   * band repeated every 30°. Rotating an un-promoted element re-rasterises all
   * of that every frame. Promoting the rotating layers means the gradient is
   * rasterised once and only the layer transform moves, which measured 49.9 ->
   * 58.1 fps at 4x CPU throttle.
   *
   * Gated rather than permanent: will-change on a 740px element holds real
   * texture memory, and at rest nothing is moving to pay for it.
   */
  const moving = isSpinning || active;
  const promote = moving
    ? ({ willChange: "transform", backfaceVisibility: "hidden" } as const)
    : undefined;

  const winnerIndex = winnerId == null ? -1 : segments.findIndex((s) => s.id === winnerId);
  const winnerSweep = count ? 360 / count : 0;
  const winnerStartDeg = winnerIndex >= 0 ? winnerIndex * winnerSweep : 0;
  const winnerEndDeg = winnerStartDeg + winnerSweep;

  useEffect(() => {
    zoomedRef.current = active;
    zoomScaleRef.current = zoomScale;
    // Leaving the zoom returns every label to full size and no blur; entering it
    // culls immediately rather than waiting for the next animation frame.
    if (active) paintLabelBlur(angleRef.current);
    else
      labelRefs.current.forEach((el) => {
        if (!el) return;
        el.style.visibility = "visible";
        el.style.filter = "none";
      });
  });

  // Alternating colourless glass panes. Two stops per pane so each is a hard
  // edge, plus a hairline of separation drawn between them.
  // `from 90deg` reconciles two different zeroes: CSS conic-gradient starts at
  // 12 o'clock, while the geometry (and every CSS rotate() here) puts 0° at 3
  // o'clock. Without it the panes sit 90° round from their own labels — which
  // hides at 4, 6, 8 and 12 places, where 90° is a whole number of panes, and
  // shows up as a winner wash landing nowhere near the pointer at every count.
  const conic = count
    ? `conic-gradient(from 90deg, ${panes(count)
        .map(
          (p) =>
            `var(${p.heavy ? "--pane-heavy" : "--pane-light"}) ${p.startDeg}deg ${p.endDeg}deg`
        )
        .join(", ")})`
    : "conic-gradient(from 90deg, var(--pane-light) 0deg 360deg)";

  const separators = count
    ? `repeating-conic-gradient(from 90deg, var(--wheel-hairline) 0deg 0.35deg, transparent 0.35deg ${360 / count}deg)`
    : "none";

  return (
    <div
      ref={frameRef}
      className="relative w-full"
      style={{
        height: discPx || undefined,
        // Clip only while the camera is in. At rest the disc breaks the frame by
        // about 30px, which the page column clips horizontally — and clipping
        // here instead would cut the disc's own drop shadow square, sitting the
        // wheel inside a faint rectangle. Zoomed, the clip is doing real work:
        // it keeps the 740px disc off the content below and gives the hub its
        // "sinking below the fold" read.
        overflow: active || receded ? "clip" : "visible",
        // Once the disc has receded it is a 14px blur at half opacity, and a hard
        // clip turns that into a visible rectangle of haze. Feathering the frame
        // edge lets it dissolve into the ground the way a blurred thing should.
        maskImage: receded
          ? "radial-gradient(120% 92% at 50% 40%, #000 55%, transparent 100%)"
          : undefined,
      }}
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
              left: contactX,
              ["--rot" as string]: "0deg",
              transform: camera,
              transformOrigin: "0% 50%",
              filter: receded && !reducedMotion ? "blur(14px)" : "none",
              opacity: receded && !reducedMotion ? 0.5 : 1,
              transition:
                "transform var(--dur-zoom) var(--ease-zoom), filter var(--dur-recede) var(--ease-standard), opacity var(--dur-recede) var(--ease-standard)",
              willChange: active ? "transform" : undefined,
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                ...promote,
                transform: "rotate(var(--rot))",
                backgroundImage: `${separators}, ${conic}`,
                boxShadow: "var(--wheel-shadow), inset 0 0 0 1px var(--glass-card-border)",
              }}
            />

            {/* The winning pane takes the persimmon wash on landing, its two
                edges lit. Drawn as its own conic so it rides --rot with the disc
                and needs no second source of truth for where the pane is. */}
            {winnerIndex >= 0 && (
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  ...promote,
                  transform: "rotate(var(--rot))",
                  backgroundImage: `conic-gradient(from 90deg, transparent 0deg ${winnerStartDeg}deg, var(--pane-win-edge) ${winnerStartDeg}deg ${winnerStartDeg + 0.6}deg, var(--pane-win) ${winnerStartDeg + 0.6}deg ${winnerEndDeg - 0.6}deg, var(--pane-win-edge) ${winnerEndDeg - 0.6}deg ${winnerEndDeg}deg, transparent ${winnerEndDeg}deg 360deg)`,
                  transition: "opacity var(--dur-view) var(--ease-standard)",
                }}
              />
            )}

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
            <div className="absolute inset-0" style={{ ...promote, transform: "rotate(var(--rot))" }}>
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
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    className="absolute left-1/2 top-1/2"
                    style={{
                      // Rotation is scoped to the zoomed state. At rest the label
                      // cancels the disc's turn and stays horizontal; zoomed it
                      // runs along the arc, which the camera's own 90° then
                      // brings upright under the pointer — so the name being read
                      // is level and the ones further round rake away.
                      transform: active
                        ? `rotate(${centerDeg}deg) translateX(${zoomLabelRadius}px) rotate(90deg)`
                        : `rotate(${centerDeg}deg) translateX(${labelRadius}px) rotate(${-centerDeg}deg) rotate(calc(-1 * var(--rot)))`,
                      transition: `transform var(--dur-zoom) var(--ease-zoom)`,
                    }}
                  >
                    <span
                      className="block -translate-x-1/2 -translate-y-1/2 text-center whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{
                        // Zoomed type is 28px on screen; the camera scale gets it
                        // there, so the local size barely moves.
                        // Zoomed, the name under the pointer is the most
                        // important text on screen and must not be cut by the
                        // frame the disc deliberately breaks. Bounded to the
                        // frame in local units, since the camera scales it up.
                        maxWidth: active ? (frameW - 32) / zoomScale : maxWidth,
                        fontSize: active ? 28 / zoomScale : labelSize,
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
              className="glass-chip absolute left-1/2 top-1/2 rounded-full flex flex-col items-center justify-center"
              style={{
                width: discPx * 0.26,
                height: discPx * 0.26,
                // A backdrop-filter inside a subtree that transforms every frame
                // re-samples its backdrop every frame. The budget's rule for a
                // cell that will not go green is that the glass on that surface
                // gets thinner, never that the timing gets shorter — so the hub
                // drops its blur while the wheel is moving and takes it back the
                // moment it stops. Worth ~1 fps and 1.2% of slow frames.
                backdropFilter: moving ? "none" : undefined,
                WebkitBackdropFilter: moving ? "none" : undefined,
                // Counter-rotates the camera's 90°: the hub is pinned to the disc
                // centre, but the count is meant to stay readable, not tip over
                // with the world.
                transform: active
                  ? "translate(-50%, -50%) rotate(-90deg)"
                  : "translate(-50%, -50%)",
                transition: "transform var(--dur-zoom) var(--ease-zoom)",
              }}
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
              opacity: active ? 0 : 1,
              transition: "opacity var(--dur-view) var(--ease-standard)",
              left: contactX,
              top: contactY,
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
            style={{
              opacity: receded ? 0 : 1,
              left: active ? frameW / 2 : Math.max(contactX, 2),
              top: active ? ZOOM_POINTER_Y : contactY,
              transform: active ? "translate(-50%, -50%) rotate(90deg)" : "translateY(-50%)",
              transition:
                "left var(--dur-zoom) var(--ease-zoom), top var(--dur-zoom) var(--ease-zoom), opacity var(--dur-recede) var(--ease-standard)",
            }}
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
