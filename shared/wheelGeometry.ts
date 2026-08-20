/**
 * Wheel geometry — the pure maths behind the Ember wheel and its spin camera.
 *
 * Presentation maths, but maths with invariants worth pinning: the disc has to
 * land the server's chosen pane on the pointer every single time, no label may
 * cross the rim at any supported width, and the zoom may never render more than
 * four labels. Those are assertions in wheelGeometry.test.ts rather than claims
 * in a comment.
 *
 * Nothing here selects a winner. The server does that (`spins.create`); this
 * module is only told which index to land on.
 *
 * Angle convention: degrees, clockwise, 0° at 3 o'clock — the same frame CSS
 * `conic-gradient` and `rotate()` use, so no value needs converting at the call
 * site. `rotationDeg` is the disc's own rotation; a pane's position on screen is
 * its centre plus that rotation.
 */

/** The spin, end to end (spec §3). */
export const SPIN_TIMELINE = {
  /** Disc counter-rotates slightly. `--ease-exit`. */
  windupMs: 180,
  /** Constant fast phase into the long tail. `--ease-decay`. Stretches while the
   *  server is still choosing — this is the floor, not the ceiling. */
  travelMs: 2600,
  /** Lands the winning pane on the pointer. `--ease-settle`. */
  settleMs: 220,
  /** Disc drops back 52px and blurs to 14px at 50% opacity. */
  recedeMs: 320,
  /** The unroll starts partway into the recede — see SPIN_TOTAL_MS. */
  unrollDelayMs: 160,
  /** Winning pane becomes full-bleed display type. */
  unrollMs: 460,
  /** Camera push into the wheel. `--ease-zoom`. */
  zoomMs: 420,
  /** Reduced motion: no zoom, no blur, no unroll — same result, no theatre. */
  reducedMs: 400,
} as const;

/**
 * 3.62s, as the spec quotes.
 *
 * Laid end to end the five phases come to 3780ms, so they only reconcile with
 * the stated total if the unroll begins 160ms into the 320ms recede — which is
 * also what it should look like, the type resolving while the disc is still on
 * its way back. The overlap is the reason this constant is not a sum.
 */
export const SPIN_TOTAL_MS =
  SPIN_TIMELINE.windupMs +
  SPIN_TIMELINE.travelMs +
  SPIN_TIMELINE.settleMs +
  SPIN_TIMELINE.unrollDelayMs +
  SPIN_TIMELINE.unrollMs;

/** Full size out to here; beyond FAR_DEG a label is not rendered at all. */
const SHARP_DEG = 22.5;
const FAR_DEG = 60;
const MAX_BLUR_PX = 6;

/** The two colourless glass fills. Alternating them is what separates panes. */
const FILL_HEAVY = 0.78;
const FILL_LIGHT = 0.4;

export interface Pane {
  index: number;
  startDeg: number;
  endDeg: number;
  /** Alpha of the white conic fill for this pane. */
  fillAlpha: number;
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest signed rotation from `fromDeg` to `toDeg`, in (-180, 180]. */
export function signedAngleDeg(fromDeg: number, toDeg: number): number {
  const d = normalizeDeg(toDeg - fromDeg);
  return d > 180 ? d - 360 : d;
}

export function paneSweepDeg(count: number): number {
  return 360 / count;
}

export function paneCenterDeg(index: number, count: number): number {
  const sweep = paneSweepDeg(count);
  return index * sweep + sweep / 2;
}

/**
 * The panes of a disc, in order.
 *
 * Fills alternate heavy/light. With an odd count the last pane meets the first,
 * so the final pane is forced to the light fill — otherwise the seam reads as
 * one double-width pane and the wheel looks broken at 7, 9 or 11 restaurants.
 */
export function panes(count: number): Pane[] {
  const sweep = paneSweepDeg(count);
  const odd = count % 2 === 1;
  return Array.from({ length: count }, (_, index) => ({
    index,
    startDeg: index * sweep,
    endDeg: (index + 1) * sweep,
    fillAlpha:
      odd && index === count - 1 ? FILL_LIGHT : index % 2 === 0 ? FILL_HEAVY : FILL_LIGHT,
  }));
}

/**
 * Motion blur for one label, by angular distance from the pointer.
 *
 * Sharp out to ±22.5°, ramping to 6px at ±60°. Never applied to the whole
 * layer: the name under the pointer is always the sharpest thing on screen.
 * `speedFactor` (0..1) tracks the deceleration, so a stopped wheel has no blur.
 */
export function labelBlurPx(distanceDeg: number, speedFactor = 1): number {
  const d = Math.abs(distanceDeg);
  if (d <= SHARP_DEG) return 0;
  const t = Math.min((d - SHARP_DEG) / (FAR_DEG - SHARP_DEG), 1);
  return t * MAX_BLUR_PX * Math.max(0, Math.min(speedFactor, 1));
}

export interface VisibleLabel {
  index: number;
  /** Signed degrees from the pointer; 0 means dead under it. */
  distanceDeg: number;
  blurPx: number;
}

/**
 * The labels worth drawing for a given disc rotation.
 *
 * At the zoom's scale only the arc around the pointer is on screen: the pair
 * either side at full size and two clipped fragments at the edges. Anything
 * further round is not rendered, which is what keeps the zoom affordable.
 */
export function visibleLabels(
  count: number,
  rotationDeg: number,
  pointerDeg: number,
  speedFactor = 1
): VisibleLabel[] {
  const out: VisibleLabel[] = [];
  for (let index = 0; index < count; index++) {
    const onScreen = paneCenterDeg(index, count) + rotationDeg;
    const distanceDeg = signedAngleDeg(pointerDeg, onScreen);
    if (Math.abs(distanceDeg) > FAR_DEG) continue;
    out.push({ index, distanceDeg, blurPx: labelBlurPx(distanceDeg, speedFactor) });
  }
  return out.sort((a, b) => Math.abs(a.distanceDeg) - Math.abs(b.distanceDeg)).slice(0, 4);
}

export interface LandingRequest {
  /** Where the disc is now. May be any magnitude — it accumulates across a spin. */
  fromDeg: number;
  /** The pane the server chose. Never picked here. */
  targetIndex: number;
  count: number;
  pointerDeg: number;
  /** Whole turns to add before landing, so the stop reads as a decision. */
  minTurns?: number;
}

/**
 * The absolute rotation to animate to, so `targetIndex` finishes centred under
 * the pointer.
 *
 * Always forwards, and always by at least `minTurns` whole turns plus whatever
 * remainder the alignment needs — a wheel that shortcuts backwards to a nearer
 * angle reads as a cheat even when the winner is honest.
 */
export function landingRotationDeg({
  fromDeg,
  targetIndex,
  count,
  pointerDeg,
  minTurns = 2,
}: LandingRequest): number {
  const wanted = normalizeDeg(pointerDeg - paneCenterDeg(targetIndex, count));
  const remainder = normalizeDeg(wanted - fromDeg);
  return fromDeg + minTurns * 360 + remainder;
}

/** Breathing room between a label's far corner and the rim. */
const RIM_PAD_PX = 6;

/**
 * Where resting labels sit, as a fraction of the disc radius.
 *
 * Pushed OUTWARD as the pane count rises, which is the opposite of the instinct.
 * Labels stay horizontal at rest, so the binding constraint at 12 and 6 o'clock
 * is the neighbouring label, not the rim — and the horizontal gap between two
 * adjacent labels is 2·r·sin(π/count), which grows with r. Pulling labels in to
 * "make room" shrinks exactly the gap that was already tightest.
 */
export function restingLabelRadiusPx(discPx: number, count: number): number {
  const ratio = count <= 8 ? 0.6 : count <= 10 ? 0.66 : 0.7;
  return (discPx / 2) * ratio;
}

/**
 * How wide a horizontal label may be before it clips.
 *
 * Two constraints, whichever bites first:
 *
 *  - The rim, which binds hardest at 3 and 9 o'clock where the box extends
 *    straight out along the radius and has the least disc left in front of it.
 *
 *  - The neighbouring label, which binds near 12 and 6 o'clock where adjacent
 *    panes sit almost level and the rim is nowhere near. Two adjacent anchors
 *    are always exactly `chord = 2·r·sin(π/count)` apart, split into Δx and Δy
 *    by where they sit on the circle. A neighbour can only collide while
 *    Δy < lineHeight, and since Δx² + Δy² = chord², the tightest Δx that can
 *    ever be in collision range is √(chord² − lineHeight²). That is the budget —
 *    exact, rather than a margin chosen by eye.
 *
 * Rotation is scoped to the zoom, so the resting wheel is the only state that
 * needs a per-angle budget at all.
 */
export function labelMaxWidthPx(
  centerDeg: number,
  radiusPx: number,
  discPx: number,
  count: number,
  lineHeightPx = 18
): number {
  const R = discPx / 2 - RIM_PAD_PX;
  const rad = (centerDeg * Math.PI) / 180;
  const x = Math.abs(radiusPx * Math.cos(rad));
  const y = Math.abs(radiusPx * Math.sin(rad));

  const span = R * R - y * y;
  const rimLimit = span <= 0 ? 0 : 2 * Math.max(0, Math.sqrt(span) - x);

  const chord = 2 * radiusPx * Math.sin(Math.PI / count);
  const neighbourLimit =
    chord > lineHeightPx ? Math.sqrt(chord * chord - lineHeightPx * lineHeightPx) : 0;

  return Math.max(0, Math.min(rimLimit, neighbourLimit));
}
