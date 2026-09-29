/**
 * What counts as a lunch. One rule, used by exclusion, statistics, fairness,
 * cuisine rotation, History, the today card and the "did you eat there?" prompt
 * (walkthrough plan §1).
 *
 * A spin is a lunch if and only if it is not skipped ("we didn't go") and
 * either someone accepted it, or the same person did not spin again on the same
 * wheel later that Taipei day. The unit is the PERSON, not the wheel: two groups
 * can each decide on their own, and one person's respin replaces only their own
 * earlier result. A spin that is not lunch and not skipped was respun.
 *
 * Callers pass one wheel's rows.
 */

// The team's calendar day is anchored to Taipei (UTC+8, no DST), so "today" has
// the same meaning whatever the server's or browser's clock zone is.
export const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Which Taipei calendar day a timestamp falls on (integer day number). */
export function taipeiDayIndex(t: Date): number {
  return Math.floor((t.getTime() + TAIPEI_OFFSET_MS) / DAY_MS);
}

/** The UTC instant of the Taipei midnight that starts `t`'s day. */
export function startOfTaipeiDay(t: Date): Date {
  return new Date(taipeiDayIndex(t) * DAY_MS - TAIPEI_OFFSET_MS);
}

/** The UTC instant of the next Taipei midnight after `t` (when its day ends). */
export function endOfTaipeiDay(t: Date): Date {
  return new Date((taipeiDayIndex(t) + 1) * DAY_MS - TAIPEI_OFFSET_MS);
}

export interface SpinFacts {
  id: number;
  restaurantId: number;
  spunBy: number;
  spunAt: Date;
  accepted: boolean;
  skipped: boolean;
}

export type SpinKind = "lunch" | "respun" | "skipped";

/** Oldest first; spins in the same instant are ordered by id. */
export function bySpinOrder(a: Pick<SpinFacts, "id" | "spunAt">, b: Pick<SpinFacts, "id" | "spunAt">): number {
  return a.spunAt.getTime() - b.spunAt.getTime() || a.id - b.id;
}

/** Each spin's kind, keyed by spin id. Input order does not matter. */
export function classifySpins(rows: readonly SpinFacts[]): Map<number, SpinKind> {
  const kinds = new Map<number, SpinKind>();
  // The newest spin per (person, Taipei day) — the one that is not replaced.
  const lastOfDay = new Map<string, SpinFacts>();
  for (const row of rows) {
    const key = `${row.spunBy}:${taipeiDayIndex(row.spunAt)}`;
    const cur = lastOfDay.get(key);
    if (!cur || bySpinOrder(row, cur) > 0) lastOfDay.set(key, row);
  }
  for (const row of rows) {
    if (row.skipped) kinds.set(row.id, "skipped");
    else if (row.accepted) kinds.set(row.id, "lunch");
    else {
      const last = lastOfDay.get(`${row.spunBy}:${taipeiDayIndex(row.spunAt)}`);
      kinds.set(row.id, last?.id === row.id ? "lunch" : "respun");
    }
  }
  return kinds;
}
