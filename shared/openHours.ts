/**
 * Opening-hours evaluation for restaurants sourced from Google Places.
 *
 * Three states, and the difference matters:
 *   "open"         — spinnable
 *   "closing_soon" — spinnable, but warn (you'd arrive near closing time)
 *   "closed"       — removed from the wheel (a hard filter, server-side)
 *   "unknown"      — hours were never fetched (hand-typed places, or a provider
 *                    with no hours). These are KEPT: most wheels have manually
 *                    added restaurants and silently dropping them would gut the
 *                    wheel. Unknown is never treated as closed.
 *
 * Times are evaluated in the *restaurant's* local time via the `utcOffsetMinutes`
 * Google reports for the place, so a wheel works the same whether the viewer is
 * in the office or on another continent — no timezone database needed.
 *
 * Pure + tested. The server owns the hard filter (spins.create) so a client can
 * never spin a closed restaurant by tampering with its candidate list.
 */

/** Google Places period: day 0 = Sunday, time "HHMM" in the place's local time. */
export interface OpenPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

export type OpenStatus = "open" | "closing_soon" | "closed" | "unknown";

export interface OpenState {
  status: OpenStatus;
  /** Minutes until closing; null when unknown, closed, or open 24h. */
  minutesUntilClose: number | null;
}

/** Warn (but still allow) when a place closes within this many minutes. */
export const CLOSING_SOON_MINUTES = 30;

const MINUTES_PER_WEEK = 7 * 24 * 60;

function isValidMark(m: unknown): m is { day: number; time: string } {
  if (!m || typeof m !== "object") return false;
  const { day, time } = m as { day?: unknown; time?: unknown };
  return (
    typeof day === "number" && day >= 0 && day <= 6 &&
    typeof time === "string" && /^\d{4}$/.test(time)
  );
}

/**
 * Coerce whatever we stored in `restaurants.openHours` into periods. Accepts a
 * raw periods array or a Google `opening_hours` wrapper. Returns null for
 * anything unusable, which callers must treat as "unknown", never "closed".
 */
export function parsePeriods(raw: unknown): OpenPeriod[] | null {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { periods?: unknown }).periods)
      ? (raw as { periods: unknown[] }).periods
      : null;
  if (!arr || arr.length === 0) return null;
  const periods = arr.filter((p): p is OpenPeriod => {
    if (!p || typeof p !== "object") return false;
    const { open, close } = p as { open?: unknown; close?: unknown };
    if (!isValidMark(open)) return false;
    return close === undefined || close === null || isValidMark(close);
  });
  return periods.length > 0 ? periods : null;
}

/** Minutes since the start of the week (Sunday 00:00) in the place's local time. */
function localWeekMinutes(now: Date, utcOffsetMinutes: number): number {
  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
}

function markMinutes(m: { day: number; time: string }): number {
  return m.day * 1440 + Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(2, 4));
}

/**
 * How long until this period closes, or null if it isn't currently active.
 * Handles windows that cross midnight (and the week boundary) by unrolling the
 * close time forward from the open time.
 */
function activeMinutesLeft(period: OpenPeriod, nowMinutes: number): number | null {
  const start = markMinutes(period.open);
  // No close time = open 24/7 (Google's convention for always-open places).
  if (!period.close) return Number.POSITIVE_INFINITY;
  let end = markMinutes(period.close);
  if (end <= start) end += MINUTES_PER_WEEK; // crosses midnight / wraps the week
  // Compare on the same unrolled axis: also try `now` shifted a week forward, so
  // a Saturday-night→Sunday-morning window still matches a Sunday-morning `now`.
  for (const t of [nowMinutes, nowMinutes + MINUTES_PER_WEEK]) {
    if (t >= start && t < end) return end - t;
  }
  return null;
}

/** true/false, or null when hours are unknown (caller keeps those on the wheel). */
export function isOpenAt(
  periods: OpenPeriod[] | null,
  now: Date,
  utcOffsetMinutes: number,
): boolean | null {
  if (!periods || periods.length === 0) return null;
  const nowMinutes = localWeekMinutes(now, utcOffsetMinutes);
  return periods.some((p) => activeMinutesLeft(p, nowMinutes) !== null);
}

/** Minutes until close; null when unknown, closed, or open 24h. */
export function minutesUntilClose(
  periods: OpenPeriod[] | null,
  now: Date,
  utcOffsetMinutes: number,
): number | null {
  if (!periods || periods.length === 0) return null;
  const nowMinutes = localWeekMinutes(now, utcOffsetMinutes);
  let best: number | null = null;
  for (const p of periods) {
    const left = activeMinutesLeft(p, nowMinutes);
    if (left === null || !Number.isFinite(left)) continue;
    if (best === null || left < best) best = left;
  }
  return best;
}

/** The single call the spin filter and the UI both use. */
export function openState(
  periods: OpenPeriod[] | null,
  now: Date,
  utcOffsetMinutes: number,
): OpenState {
  const open = isOpenAt(periods, now, utcOffsetMinutes);
  if (open === null) return { status: "unknown", minutesUntilClose: null };
  if (!open) return { status: "closed", minutesUntilClose: null };
  const left = minutesUntilClose(periods, now, utcOffsetMinutes);
  if (left !== null && left <= CLOSING_SOON_MINUTES) {
    return { status: "closing_soon", minutesUntilClose: left };
  }
  return { status: "open", minutesUntilClose: left };
}

/** Is this restaurant spinnable right now? Unknown hours count as spinnable. */
export function isSpinnableNow(
  rawOpenHours: unknown,
  utcOffsetMinutes: number | null,
  now: Date = new Date(),
): boolean {
  const state = openState(parsePeriods(rawOpenHours), now, utcOffsetMinutes ?? 0);
  return state.status !== "closed";
}
