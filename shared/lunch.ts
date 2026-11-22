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

/** "12:10" — the Taipei wall clock, which is the team's, whatever zone the
 *  viewer or the server runs in. */
export function taipeiClock(t: Date): string {
  return new Date(t.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(11, 16);
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

export interface PlaceLunches {
  lunchCount: number;
  lastLunchAt: Date;
}

export interface LunchStats {
  /** Only places with at least one lunch appear. */
  byRestaurant: Map<number, PlaceLunches>;
  /** Taipei days with at least one lunch. */
  lunchDays: number;
  placesEaten: number;
}

/** Lunches per place and in total — the only thing History, fairness and cuisine
 *  rotation count. A spin that was respun or skipped is not a visit. */
export function lunchStats(rows: readonly SpinFacts[]): LunchStats {
  const kinds = classifySpins(rows);
  const byRestaurant = new Map<number, PlaceLunches>();
  const days = new Set<number>();
  for (const row of rows) {
    if (kinds.get(row.id) !== "lunch") continue;
    days.add(taipeiDayIndex(row.spunAt));
    const cur = byRestaurant.get(row.restaurantId);
    if (!cur) byRestaurant.set(row.restaurantId, { lunchCount: 1, lastLunchAt: row.spunAt });
    else {
      cur.lunchCount++;
      if (row.spunAt > cur.lastLunchAt) cur.lastLunchAt = row.spunAt;
    }
  }
  return { byRestaurant, lunchDays: days.size, placesEaten: byRestaurant.size };
}

/** Today's lunches (Taipei day of `now`), oldest first: what the today card
 *  lists. One person's respins collapse to their last spin; an accepted lunch
 *  stays beside a later one, because it was a separate decision. */
export function todaysLunches<T extends SpinFacts>(rows: readonly T[], now: Date): T[] {
  const today = taipeiDayIndex(now);
  const kinds = classifySpins(rows);
  return rows
    .filter((r) => taipeiDayIndex(r.spunAt) === today && kinds.get(r.id) === "lunch")
    .sort(bySpinOrder);
}

/** How many Taipei days back a lunch is still worth asking about. */
export const PROMPT_DAYS = 3;

/**
 * The lunch to ask "how was it?" about: the most recent lunch on an EARLIER
 * Taipei day, within PROMPT_DAYS, at a place the viewer has not rated.
 * Today's lunch is left alone — you have not eaten it yet, which is why the
 * stars left the result card.
 */
export function promptableLunch<T extends SpinFacts>(
  rows: readonly T[],
  now: Date,
  ratedRestaurantIds: ReadonlySet<number>,
): T | null {
  const today = taipeiDayIndex(now);
  const kinds = classifySpins(rows);
  let best: T | null = null;
  for (const r of rows) {
    const age = today - taipeiDayIndex(r.spunAt);
    if (age < 1 || age > PROMPT_DAYS) continue;
    if (kinds.get(r.id) !== "lunch" || ratedRestaurantIds.has(r.restaurantId)) continue;
    if (!best || bySpinOrder(r, best) > 0) best = r;
  }
  return best;
}

export interface DiaryDay<T> {
  /** Taipei day index (taipeiDayIndex). */
  day: number;
  lunches: T[];
  respun: T[];
  skipped: T[];
}

/** History as a diary: one entry per Taipei day that had any spin, newest day
 *  first, each day's spins oldest first and split by kind. */
export function lunchDiary<T extends SpinFacts>(rows: readonly T[]): DiaryDay<T>[] {
  const kinds = classifySpins(rows);
  const byDay = new Map<number, DiaryDay<T>>();
  for (const r of [...rows].sort(bySpinOrder)) {
    const day = taipeiDayIndex(r.spunAt);
    let d = byDay.get(day);
    if (!d) byDay.set(day, (d = { day, lunches: [], respun: [], skipped: [] }));
    const kind = kinds.get(r.id);
    (kind === "lunch" ? d.lunches : kind === "respun" ? d.respun : d.skipped).push(r);
  }
  return Array.from(byDay.values()).sort((a, b) => b.day - a.day);
}

/** Which Monday-to-Sunday week a Taipei day falls in. Day 0 (1970-01-01) was a
 *  Thursday, so +3 puts Mondays on the week boundary. */
export function mondayWeek(day: number): number {
  return Math.floor((day + 3) / 7);
}

/** A span of days as whole weeks, rounded up: 21 days is three, one day is one. */
export function weeksSpanned(firstDay: number, lastDay: number): number {
  return Math.max(1, Math.ceil((lastDay - firstDay + 1) / 7));
}
