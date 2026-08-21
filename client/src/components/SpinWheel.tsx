import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  EASE_DECAY,
  EASE_EXIT,
  EASE_SETTLE,
  EASE_STANDARD,
  SPIN_TIMELINE,
  landingRotationDeg,
  normalizeDeg,
  paneCenterDeg,
  panes,
  labelRay,
  restingWheelMetrics,
  wedgeClipPolygon,
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
  /**
   * Fires when a DIFFERENT pane arrives at the pointer — not every frame.
   *
   * The readout has to name whatever is under the pointer, including mid-spin,
   * but a state update per frame would cost the whole frame budget. A pane
   * change happens a few dozen times in a spin, not sixty times a second.
   */
  onPointerIndexChange?: (index: number) => void;
}

/** Resting pointer sits on the left rim, pointing in. 0° is 3 o'clock. */
const POINTER_DEG = 180;

/**
 * The resting disc sits fully on-screen: 92% of the frame width, centred.
 *
 * The circle breaking an edge is still the signature motif, but §4 now scopes it
 * to the ZOOMED spin, the Places map and the History ring. A labelled disc is
 * the exception: a circle that breaks an edge cannot carry readable labels on
 * the part that is off-screen, and the labels are the point of the resting
 * state. The zoom is where it genuinely breaks both edges.
 */
const DISC_TO_FRAME = 0.92;
const DISC_CENTER_X = 0.5;

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
  onPointerIndexChange,
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
  const pointerIndexRef = useRef(-1);
  /** Last written display/blur per label, so identical writes are skipped. */
  const labelStateRef = useRef<{ shown: boolean; blur: number }[]>([]);
  const [restRotation, setRestRotation] = useState(0);
  const onPointerIndexChangeRef = useRef(onPointerIndexChange);
  onPointerIndexChangeRef.current = onPointerIndexChange;
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

  /**
   * Seat pane 0 on the pointer — ONCE per set of places, never again.
   *
   * At rotation 0 the pointer lands exactly on a pane BOUNDARY whenever the
   * count divides 180 evenly: at eight places it sits precisely between panes 3
   * and 4, so the wheel opens pointing at nothing and the readout has to guess.
   *
   * The guard is the important half. The rAF loop owns the disc's rotation once
   * a spin starts, so an effect that re-seats whenever `isSpinning` changes
   * snaps the disc back to pane 0 the instant the spin ends — silently undoing
   * the landing while the winner banner says otherwise. Seeding is an INITIAL
   * VALUE, not a state the effect keeps restoring.
   */
  const seatedForRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const n = segments.length;
    // frameW is in the deps because the disc does not exist until the frame has
    // been measured — writing --rot before then lands on nothing.
    if (isSpinning || n === 0 || frameW === 0) return;
    if (seatedForRef.current === n) return;
    seatedForRef.current = n;
    const seat = normalizeDeg(POINTER_DEG - paneCenterDeg(0, n));
    applyRotation(seat);
    setRestRotation(seat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length, isSpinning, frameW]);

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
    reportPointerIndex(deg);
  };

  /** Which pane is at the pointer now — reported only when it changes. */
  const reportPointerIndex = (deg: number) => {
    const n = segmentsRef.current.length;
    if (!n) return;
    const sweep = 360 / n;
    const idx = Math.floor(normalizeDeg(POINTER_DEG - deg) / sweep) % n;
    if (idx === pointerIndexRef.current) return;
    pointerIndexRef.current = idx;
    onPointerIndexChangeRef.current?.(idx);
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
      // Writing the same value again still invalidates style and layout, and
      // this runs 60 times a second across every label. Only write on change.
      const prev = labelStateRef.current[i];
      const nextBlur = l ? Math.round(l.blurPx * 4) / 4 : 0;
      if (prev && prev.shown === !!l && prev.blur === nextBlur) continue;
      labelStateRef.current[i] = { shown: !!l, blur: nextBlur };
      if (!l) {
        // `display` rather than `visibility`: a hidden-but-displayed label still
        // takes part in layout and compositing, and each one of these is a
        // full-disc wrapper. At 24 places that was 20 wrappers being composited
        // every frame to show nothing. §4 says anything past the arc is not
        // rendered — this is what "not rendered" has to mean.
        el.style.display = "none";
        continue;
      }
      el.style.display = "contents";
      // Blur the TEXT, not the wrapper. The wrapper spans the whole disc — 935px
      // once the camera is in — and blurring a layer that size costs orders of
      // magnitude more than blurring the glyphs sitting in it.
      const inner = el.firstElementChild as HTMLElement | null;
      if (inner) inner.style.filter = nextBlur > 0.01 ? `blur(${nextBlur / scale}px)` : "none";
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
        setRestRotation(normalizeDeg(targetAngle));
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
  // The whole resting geometry — disc, hub, band, tier, and the band-start fit
  // check — comes from one place, so the component never re-derives it.
  const metrics = restingWheelMetrics(frameW || 1, Math.max(count, 1));
  // Spec sets the resting label at 15px. Narrower wedges get a smaller size so a
  // name keeps a few more characters before the ellipsis — at 12 places the
  // wedge simply is not wide enough for a full name, and the zoom is where the
  // names become legible (headline-sized, one at a time).


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
    // Both arms clear the cache in the same breath as they touch the DOM. The
    // cache is only sound while it is the ONLY writer: an unbraced else once let
    // the bulk reset run on every render, so the DOM said "visible" while the
    // cache still said "culled" and the culling never re-engaged.
    labelStateRef.current = [];
    if (active) {
      paintLabelBlur(angleRef.current);
    } else {
      labelRefs.current.forEach((el) => {
        if (!el) return;
        el.style.display = "";
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) inner.style.filter = "none";
      });
    }
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
                so it stays put while the wheel turns underneath it.

                Promoted like its siblings: it is a full-disc gradient sitting on
                top of layers that transform every frame, and an unpromoted
                overlay in that position is re-rastered on each one. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ ...promote, backgroundImage: "var(--wheel-highlight)" }}
            />

            {/* Labels. Radial at rest, tangential in the zoom — and each one
                clipped to its own wedge, which is what makes a name crossing a
                pane boundary impossible by construction rather than by tuning. */}
            {/* Promoted, like the other rotating layers. Dropping the promotion
                while the camera is in was measured and is WORSE (46.3 vs 49.6
                fps at 24 places) — the re-raster it avoids costs more than the
                texture it saves. */}
            <div className="absolute inset-0" style={{ ...promote, transform: "rotate(var(--rot))" }}>
              {(metrics.drawLabels ? segments : []).map((seg, i) => {
                const ray = labelRay(i, count, restRotation);
                const { tier } = metrics;
                // Flipped labels read back toward the hub, so their box hangs off
                // the other side of the ray and is right-aligned.
                const restTransform = `rotate(${ray.flipped ? ray.deg + 180 : ray.deg}deg)`;
                const text = tier.indexOnly ? String(i + 1) : seg.label;
                return (
                  <div
                    key={seg.id}
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    className={active ? undefined : "absolute inset-0"}
                    style={
                      active
                        ? // Zoomed there is no clip, so the wedge wrapper is pure
                          // overhead — and it is disc-sized, which is 935px once
                          // the camera is in. `display: contents` makes it
                          // generate no box at all, leaving the label positioned
                          // against the disc exactly as before.
                          { display: "contents" }
                        : { clipPath: wedgeClipPolygon(i, count, discPx), pointerEvents: "none" }
                    }
                  >
                    <div
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: active
                          ? `rotate(${ray.deg}deg) translateX(${zoomLabelRadius}px) rotate(90deg)`
                          : restTransform,
                        transition: `transform var(--dur-zoom) var(--ease-zoom)`,
                      }}
                    >
                      <span
                        className="block absolute"
                        style={
                          active
                            ? {
                                // Zoomed type is 28px on screen; the camera scale
                                // gets it there, so the local size barely moves.
                                // Bounded to the frame in local units, since the
                                // name under the pointer must never be cut.
                                transform: "translate(-50%, -50%)",
                                maxWidth: (frameW - 32) / zoomScale,
                                fontSize: 28 / zoomScale,
                                fontWeight: 700,
                                letterSpacing: "-0.02em",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                textAlign: "center",
                                color: "var(--foreground)",
                              }
                            : {
                                // The band IS the max-width: a long name
                                // ellipsises before the wedge clip could ever
                                // bisect a glyph. Never rely on the clip to end
                                // a line.
                                [ray.flipped ? "right" : "left"]: metrics.bandStartPx,
                                top: -tier.bandHeightPx * metrics.typeScale * 0.5,
                                width: metrics.maxTextWidthPx,
                                maxWidth: metrics.maxTextWidthPx,
                                height: tier.bandHeightPx * metrics.typeScale,
                                textAlign: tier.indexOnly ? "center" : ray.flipped ? "right" : "left",
                                fontSize: tier.fontPx * metrics.typeScale,
                                lineHeight: `${tier.lineHeightPx * metrics.typeScale}px`,
                                // 500, not 700. Chinese strokes are dense enough
                                // that bold at 12px closes the counters and the
                                // name turns into a blob — and these labels sit
                                // on translucent glass, the hardest contrast
                                // case in the app, where a blob is unreadable.
                                fontWeight: 500,
                                // Positive tracking, not the Latin display's
                                // negative: on an arc, adjacent CJK glyphs
                                // otherwise touch and the strokes run together.
                                letterSpacing: "0.02em",
                                color: tier.muted ? "var(--body-warm)" : "var(--ink-warm)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                // Wrap first, truncate last: two lines where the
                                // wedge affords them, one where it does not.
                                //
                                // One-line tiers use nowrap rather than a
                                // 1-line clamp. CJK breaks between any two
                                // characters, and the clamp let a line break
                                // land on a punctuation mark — a name ending in
                                // a lone 《 on its own. nowrap has no break
                                // opportunities to get wrong.
                                ...(tier.lines > 1
                                  ? {
                                      display: "-webkit-box",
                                      WebkitBoxOrient: "vertical" as const,
                                      WebkitLineClamp: tier.lines,
                                      textWrap: "balance" as const,
                                      wordBreak: "break-word" as const,
                                    }
                                  : { whiteSpace: "nowrap" as const }),
                              }
                        }
                      >
                        {active ? seg.label : text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hub — glass, with the count that is actually in play. */}
            <div
              className="glass-chip absolute left-1/2 top-1/2 rounded-full flex flex-col items-center justify-center"
              style={{
                width: metrics.hubPx,
                height: metrics.hubPx,
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
                style={{ fontSize: metrics.hubPx * 0.38, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--ink-strong)" }}
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
              // 30x32, apex right, BITING INTO the rim rather than floating
              // outside it — that overlap is what frees the disc to use the full
              // frame width instead of reserving a gutter for the pointer.
              left: active ? frameW / 2 : contactX - 9 * metrics.scale,
              top: active ? ZOOM_POINTER_Y : contactY,
              transform: active ? "translate(-50%, -50%) rotate(90deg)" : "translateY(-50%)",
              transition:
                "left var(--dur-zoom) var(--ease-zoom), top var(--dur-zoom) var(--ease-zoom), opacity var(--dur-recede) var(--ease-standard)",
            }}
          >
            <svg
              width={30 * metrics.scale}
              height={32 * metrics.scale}
              viewBox="0 0 30 32"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M29 16L3 3L3 29Z"
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
