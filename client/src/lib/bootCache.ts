/**
 * Last-known app payload, cached in the browser so a reload paints instantly.
 *
 * Why: entry data comes from one `wheels.bootstrap` round trip, but that request
 * still has to cross a cold serverless function and a TiDB Serverless cluster
 * that auto-pauses when idle — several seconds on a quiet staging/free tier. The
 * React Query cache is memory-only, so every reload started from nothing and the
 * user stared at a spinner.
 *
 * So we persist the payload and seed the query caches from it *synchronously on
 * mount*, before the first paint: the app renders immediately with last-known
 * data, and the real bootstrap request revalidates in the background
 * (stale-while-revalidate). Serialised with superjson, not JSON, because the
 * payload is full of `Date`s (spunAt, excludedUntil, createdAt…) that must come
 * back as Dates and not strings.
 *
 * Privacy: this is the signed-in user's own wheel data in their own browser, but
 * it must never outlive their session — `clearBootCache()` is called on sign-out,
 * and a payload belonging to a different user id is discarded on read.
 */

import superjson from "superjson";

const KEY = "lw:boot:v1";

/** Persist a bootstrap payload. Never throws (private mode / quota). */
export function saveBootCache(payload: unknown): void {
  try {
    localStorage.setItem(KEY, superjson.stringify(payload));
  } catch {
    // Storage unavailable or full — the app just loses the fast path.
  }
}

/**
 * Read the cached payload. Returns null when absent, unreadable, or written by a
 * different user than the one we expect.
 */
export function readBootCache<T extends { user?: { id: number } | null }>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = superjson.parse<T>(raw);
    // A payload with no user is useless (and would seed an empty app).
    if (!parsed || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the cache — called on sign-out so the next user can't see these wheels. */
export function clearBootCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
