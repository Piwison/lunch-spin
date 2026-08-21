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

export interface Pane {
  index: number;
  startDeg: number;
  endDeg: number;
  /**
   * Which of the two colourless glass fills this pane takes. Alternating them is
   * what separates one pane from the next.
   *
   * Deliberately a choice, not a colour: the light recipe is white at 78%/40%
   * and the dark one is white at 12%/6%, so the actual values belong in CSS
   * where they follow the theme. Baking the light alphas in here is what made
   * the first dark render look like opaque grey card instead of glass.
   */
  heavy: boolean;
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
    heavy: odd && index === count - 1 ? false : index % 2 === 0,
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

/* ─── The resting wheel (spec §4) ──────────────────────────────────────────────
 *
 * Radial labels, not horizontal. A horizontal name laid across a wedge that is
 * not itself horizontal always ends up crossing a boundary and reading as if it
 * belongs to two places — that was the defect that forced this redesign, and it
 * is why none of the width tuning that preceded it worked.
 *
 * Three things do the work together, and removing any one brings the defect
 * back: each label sits on its own pane's centre ray, each is CLIPPED to its own
 * wedge so crossing a boundary is impossible by construction, and each has a
 * max-width so a long name ellipsises before the clip could bisect a glyph.
 *
 * Reference frame is 390px wide. Every number scales with the frame; NOTHING
 * scales with the place count — a wheel of 24 is the same disc as a wheel of 4.
 */

/** The frame width every literal below is quoted at. */
export const WHEEL_REF_FRAME_PX = 390;

const DISC_TO_FRAME = 0.92;
const HUB_REF_PX = 100;
const HUB_CLEAR_REF_PX = 8;
const RIM_MARGIN_REF_PX = 20;
const TEXT_PAD_REF_PX = 4;

/**
 * The smallest a Chinese character may ever be drawn.
 *
 * Everything else scales with the frame, but type cannot: at a 320px frame that
 * rule took the dense tiers to 8–9px, and a CJK glyph at 8px is a smudge rather
 * than a character. Geometry keeps scaling; the type stops here and the band
 * start absorbs the difference.
 */
const MIN_CJK_PX = 11;

/** Below this the band has nowhere to put even a two-digit index. */
const MIN_INDEX_WIDTH_REF_PX = 18;

/** Arc sampling for the wedge clip, and how far past the rim it reaches. */
const ARC_SAMPLE_DEG = 4;
const CLIP_OVERSHOOT_PX = 8;

export interface LabelTier {
  fontPx: number;
  lineHeightPx: number;
  bandHeightPx: number;
  lines: number;
  /** Above 16 places the disc carries indices and hands legibility to the readout. */
  indexOnly: boolean;
  /** The index tier is set back, so it needs its own band start. */
  bandStartRefPx: number;
  /** Index numbers are muted; names are not. */
  muted: boolean;
}

/**
 * The last place count that still carries NAMES on the disc.
 *
 * §4 put this at 16, reasoning that no type size past sixteen panes is both
 * legible and contained. That was reasoned about long Latin names. A CJK name is
 * few characters but each is full-width, so the binding number is characters,
 * not letters — and at 17-24 the band still holds about seven of them, which is
 * what the shipped app displays legibly on a 21-place wheel today.
 *
 * Past this the disc carries indices and the zoom reveals the names: the camera
 * puts one pane's name on screen at headline size, so nothing is lost, it just
 * arrives when the wheel is actually being read.
 */
const NAME_CEILING = 24;

/**
 * Type size is fixed per tier and never interpolated between them.
 *
 * A 45° wedge has far more tangential room than one line of type uses, which is
 * what pays for the two-line band at low counts — ordinary restaurant names fit
 * whole rather than truncating.
 *
 * The dense tiers sit in 11–12.5px. A Chinese glyph fills its em box where a
 * Latin letter leaves side bearings, so a size that reads comfortably in Latin
 * is crowded in CJK — and these are the counts where crowding actually bites.
 * Sparse wheels keep a larger size because a 45° wedge has the room for it.
 */
export function labelTier(count: number): LabelTier {
  if (count <= 8) {
    return { fontPx: 14, lineHeightPx: 16, bandHeightPx: 34, lines: 2, indexOnly: false, bandStartRefPx: 58, muted: false };
  }
  if (count <= 16) {
    return { fontPx: 12.5, lineHeightPx: 18, bandHeightPx: 18, lines: 1, indexOnly: false, bandStartRefPx: 58, muted: false };
  }
  if (count <= NAME_CEILING) {
    return { fontPx: 12, lineHeightPx: 16, bandHeightPx: 16, lines: 1, indexOnly: false, bandStartRefPx: 68, muted: false };
  }
  return { fontPx: 11, lineHeightPx: 15, bandHeightPx: 15, lines: 1, indexOnly: true, bandStartRefPx: 68, muted: true };
}

/**
 * Whether a band of height `h` fits inside an n-way wedge at radius `r0`.
 *
 * A wedge is a triangle near its apex: at radius r it is only 2·r·tan(180/n)
 * across. So a band of height h has to start beyond h / (2·tan(180/n)) or it is
 * wider than the wedge that is supposed to contain it — and the clip would eat
 * the type. This is asserted at render time rather than assumed.
 */
export function bandStartFits(n: number, bandHeightPx: number, bandStartPx: number): boolean {
  const halfWedgeRad = ((180 / n) * Math.PI) / 180;
  return bandHeightPx / (2 * Math.tan(halfWedgeRad)) <= bandStartPx;
}

export interface RestingWheelMetrics {
  scale: number;
  /** Scale for TYPE — the frame scale, floored so CJK never goes under 11px. */
  typeScale: number;
  discPx: number;
  radiusPx: number;
  hubPx: number;
  bandStartPx: number;
  bandEndPx: number;
  bandLengthPx: number;
  /** The label's max-width — a long name ellipsises before the clip reaches it. */
  maxTextWidthPx: number;
  tier: LabelTier;
  /** False once the band is too short even for an index; the readout carries it. */
  drawLabels: boolean;
}

export function restingWheelMetrics(frameWidthPx: number, count: number): RestingWheelMetrics {
  const scale = frameWidthPx / WHEEL_REF_FRAME_PX;
  const discPx = frameWidthPx * DISC_TO_FRAME;
  const radiusPx = discPx / 2;
  const hubPx = HUB_REF_PX * scale;
  const bandEndPx = radiusPx - RIM_MARGIN_REF_PX * scale;
  const tier = labelTier(count);

  // The band start is CHECKED, not chosen. Where the tier's own start would put
  // the band inside a wedge too narrow to hold it, the start is raised — never
  // the type shrunk, which is the spec's explicit instruction.
  const typeScale = Math.max(scale, MIN_CJK_PX / tier.fontPx);
  // Checked at the size actually drawn. Checking the scaled-down size would pass
  // while the real type overflowed its wedge.
  const bandHeight = tier.bandHeightPx * typeScale;
  const required = bandHeight / (2 * Math.tan(((180 / count) * Math.PI) / 180));
  const floor = Math.max(tier.bandStartRefPx * scale, hubPx / 2 + HUB_CLEAR_REF_PX * scale);
  const bandStartPx = Math.max(floor, required);

  const bandLengthPx = Math.max(0, bandEndPx - bandStartPx);
  const maxTextWidthPx = Math.max(0, bandLengthPx - TEXT_PAD_REF_PX * scale);

  return {
    scale, typeScale, discPx, radiusPx, hubPx, bandStartPx, bandEndPx, bandLengthPx, maxTextWidthPx, tier,
    drawLabels: maxTextWidthPx >= MIN_INDEX_WIDTH_REF_PX * scale,
  };
}

export interface LabelRay {
  deg: number;
  /** Rotated a further 180° and right-aligned, so no name is ever upside down. */
  flipped: boolean;
}

/**
 * The ray a label reads along, and whether it has to be flipped upright.
 *
 * §4 states the flip rule as "mid-angle between 180° and 360°" measured from 12
 * o'clock. This module's zero is 3 o'clock, so the same half of the wheel is
 * (90°, 270°) here — the half where text rotated onto its ray comes out upside
 * down.
 *
 * `discRotationDeg` is not optional detail: the flip depends on where the label
 * ends up ON SCREEN, and the disc is always turned by something — the wheel
 * opens with pane 0 seated at the pointer, and every landing leaves it somewhere
 * else again. Deciding from the pane's own angle instead renders half the wheel
 * upside down at rest.
 */
export function labelRay(index: number, count: number, discRotationDeg: number): LabelRay {
  const deg = paneCenterDeg(index, count);
  const onScreen = normalizeDeg(deg + discRotationDeg);
  return { deg, flipped: onScreen > 90 && onScreen < 270 };
}

/**
 * The `clip-path` polygon for one pane's wedge, in disc-local px.
 *
 * Apex at the disc centre, arc sampled every ~4° out to R + 8 so the clip ends
 * past the rim rather than on it. Crossing a pane boundary is then impossible by
 * construction rather than by tuning — which is the whole point.
 */
export function wedgeClipPolygon(
  index: number,
  count: number,
  discPx: number,
  overshootPx = CLIP_OVERSHOOT_PX
): string {
  const R = discPx / 2;
  const reach = R + overshootPx;
  const sweep = paneSweepDeg(count);
  const start = index * sweep;
  const end = start + sweep;

  const at = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(R + reach * Math.cos(rad)).toFixed(2)}px ${(R + reach * Math.sin(rad)).toFixed(2)}px`;
  };

  const pts = [`${R.toFixed(2)}px ${R.toFixed(2)}px`];
  for (let a = start; a < end; a += ARC_SAMPLE_DEG) pts.push(at(a));
  pts.push(at(end));
  return `polygon(${pts.join(", ")})`;
}

/**
 * A cubic-bezier easing function, matching the CSS timing function of the same
 * control points.
 *
 * The spin is driven from a rAF loop rather than a CSS transition, because the
 * travel phase has to stretch while the server is still choosing a winner. That
 * means the curves in index.css and the curves the wheel actually moves along
 * would be two separate sources of truth unless the loop evaluates the very same
 * control points — so it does.
 *
 * Solves x(t) = p for t by bisection. Cheap enough at 60fps (a handful of
 * iterations against a monotonic function) and exact to well under a pixel.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };
  return (p: number): number => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = p;
    for (let i = 0; i < 24; i++) {
      const x = curve(x1, x2, t);
      if (Math.abs(x - p) < 1e-6) break;
      if (x < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return curve(y1, y2, t);
  };
}

/** The four curves from index.css, evaluated the same way the CSS would. */
export const EASE_STANDARD = cubicBezier(0.2, 0.9, 0.1, 1);
export const EASE_EXIT = cubicBezier(0.4, 0, 1, 1);
/** Overshoots past 1 before settling — the only curve allowed to bounce. */
export const EASE_SETTLE = cubicBezier(0.34, 1.26, 0.64, 1);
export const EASE_DECAY = cubicBezier(0.08, 0.82, 0.17, 1);
