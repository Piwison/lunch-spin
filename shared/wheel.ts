/**
 * Pure wheel-spin geometry.
 *
 * Extracted from the SpinWheel component so the landing math is testable in
 * isolation and the animation can never disagree with the recorded result.
 *
 * Convention: the pointer sits at the top of the wheel, i.e. at angle -π/2.
 * Segment `i` occupies the arc [baseAngle + i·slice, baseAngle + (i+1)·slice],
 * so its centre is at baseAngle + i·slice + slice/2.
 */

export const TAU = Math.PI * 2;
const POINTER_ANGLE = -Math.PI / 2;

/** Normalise an angle into [0, 2π). */
export function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * The base wheel angle at which segment `targetIdx`'s centre lines up under the
 * pointer.
 */
export function segmentCenterTargetAngle(targetIdx: number, count: number): number {
  const slice = TAU / count;
  return POINTER_ANGLE - (targetIdx * slice + slice / 2);
}

/**
 * Given the wheel's current resting angle, pick a target segment and return the
 * absolute angle to animate to so that segment lands exactly under the pointer.
 *
 * `rng` is injectable so the result is deterministic under test. The first
 * `rng()` chooses the segment; the second adds a few *whole* extra turns for
 * visual variety (whole turns leave the mod-2π landing position unchanged, so
 * the wheel always stops exactly on the chosen segment).
 *
 * When `targetIdx` is provided (e.g. a server-authoritative winner), the wheel
 * animates to that segment instead of choosing one at random.
 */
export function computeSpin(opts: {
  count: number;
  currentAngle: number;
  minRotations: number;
  extraTurnSpread?: number;
  rng?: () => number;
  targetIdx?: number;
}): { targetIdx: number; targetAngle: number } {
  const { count, currentAngle, minRotations, extraTurnSpread = 3 } = opts;
  const rng = opts.rng ?? Math.random;
  if (count <= 0) throw new Error("computeSpin requires at least one segment");

  const targetIdx =
    opts.targetIdx != null
      ? Math.max(0, Math.min(count - 1, opts.targetIdx))
      : Math.min(count - 1, Math.floor(rng() * count));
  const targetCenter = segmentCenterTargetAngle(targetIdx, count);

  // Whole extra turns only, then the shortest forward delta onto the target.
  const extraTurns = minRotations + Math.floor(rng() * extraTurnSpread);
  const delta = extraTurns * TAU + normalizeAngle(targetCenter - currentAngle);

  return { targetIdx, targetAngle: currentAngle + delta };
}

/**
 * Inverse of the landing math: which segment sits under the pointer when the
 * wheel rests at `angle`. Used in tests to assert the wheel stops where it says.
 */
export function segmentUnderPointer(angle: number, count: number): number {
  const slice = TAU / count;
  const rel = normalizeAngle(POINTER_ANGLE - angle); // == targetIdx·slice + slice/2
  // (+ count) % count normalises into [0, count) and avoids a signed -0 result.
  return ((Math.round((rel - slice / 2) / slice) % count) + count) % count;
}
