/**
 * Pure "smart exclusion" logic.
 *
 * A restaurant spun within the exclusion window drops off the wheel so the
 * group doesn't repeat a recent meal — unless the latest spin for it was
 * manually re-enabled. Shared by the server query (server/db.ts) and its tests
 * so the production code and the tested code can never drift apart.
 */

export const DEFAULT_EXCLUSION_DAYS = 3;

export interface SpinRecord {
  restaurantId: number;
  spunAt: Date;
  manuallyReenabled: boolean;
}

/**
 * Restaurant ids that should be hidden from the wheel right now.
 *
 * For each restaurant only its most recent spin inside the window matters: if
 * that spin was manually re-enabled the restaurant stays available.
 */
export function computeExcludedIds(
  spins: SpinRecord[],
  opts: { now?: Date; windowDays?: number } = {},
): number[] {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? DEFAULT_EXCLUSION_DAYS;
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const recent = spins
    .filter((s) => s.spunAt > cutoff)
    .sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime());

  const seen = new Set<number>();
  const excluded: number[] = [];
  for (const row of recent) {
    if (seen.has(row.restaurantId)) continue;
    seen.add(row.restaurantId);
    if (!row.manuallyReenabled) excluded.push(row.restaurantId);
  }
  return excluded;
}
