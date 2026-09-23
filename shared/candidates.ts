/**
 * The first-run candidate pool: what the "pick your spots" screen holds, what
 * it shows, and what a filter would bring back.
 *
 * Three backlog items meet here (BACKLOG.md 1b/1c/1d):
 *
 *   1b  The server used to cut nearby results to the WHEEL's size (12) before
 *       returning them, so the client had nothing in reserve and any filter
 *       emptied the list. The pool is now one Nearby Search page (20), and the
 *       wheel cap stays a separate number.
 *   1c  Narrowing never needs a request: walk time, price and open-now are all
 *       already on the rows. Only a new keyword, a wider search, or a pool that
 *       has run dry goes back to Google. So filtering is instant and pure, and
 *       there is no "apply" button — a chip that shows one state while the list
 *       shows another is failure modes 38/54.
 *   1d  A place with a judged Google rating under 3.0 is not served. It is
 *       hidden, never deleted: the screen says how many and brings them back in
 *       one tap. Too few reviews is not a low rating.
 *
 * The rule tying them together is that the wheel is exactly the ticked places
 * that are visible (`onWheel`). A tick hidden behind a chip does not ride along.
 */

import { MAX_SEGMENTS } from "./nearby";
import { DEFAULT_PICK_COUNT, preselectPlaceIds } from "./onboarding";

/** One Nearby Search page — the most we can hold without another Google call. */
export const CANDIDATE_POOL = 20;

/** A judged rating strictly below this is hidden. 3.0 itself stays. */
export const LOW_RATING_THRESHOLD = 3;

/** Fewer reviews than this and the average means nothing in either direction. */
export const MIN_REVIEWS_TO_JUDGE = 5;

/**
 * Section edges for the pick list, in walk minutes. 5 and 10 are also the walk
 * chips, so applying a chip removes whole sections rather than half of one.
 */
export const WALK_BANDS = [3, 5, 10, 15] as const;

/** Just enough of a nearby result for these rules to judge it. */
export interface Candidate {
  placeId: string;
  walkMinutes: number;
  priceLevel?: number | null;
  /** Provider open-now hint; null/undefined when it didn't say. */
  open?: boolean | null;
  rating?: number | null;
  ratingCount?: number | null;
  permanentlyClosed?: boolean;
}

export interface CandidateFilters {
  /** Minutes, inclusive; null = off. */
  walkCap?: number | null;
  /** 1..4, inclusive; null = off. An unknown price always passes. */
  priceCap?: number | null;
  /** Drop places reported closed. Unknown hours pass. */
  openOnly?: boolean;
  /** Bring back the low-rated places 1d hides. */
  showLowRated?: boolean;
}

export interface CandidateView<P extends Candidate> {
  /** What the list shows, in the pool's order. */
  visible: P[];
  /** Low-rated places that pass every OTHER filter — exactly what 顯示 adds. */
  lowRated: P[];
}

export type RelaxationKind = "openOnly" | "priceCap" | "walkCap" | "lowRated";

export interface Relaxation {
  kind: RelaxationKind;
  /** How many places lifting this one filter puts back on screen. */
  gain: number;
}

/**
 * Whether a place can be offered at all. A permanent closure can never be
 * lunch, so unlike every other rule here it is not restorable — the server
 * applies it once, before ranking, for every caller.
 */
export function isCandidate(p: Pick<Candidate, "permanentlyClosed">): boolean {
  return p.permanentlyClosed !== true;
}

export type RatingStanding = "rated" | "few-reviews" | "unrated";

export function ratingStanding(p: Pick<Candidate, "rating" | "ratingCount">): RatingStanding {
  if (p.rating == null) return "unrated";
  if (p.ratingCount == null || p.ratingCount < MIN_REVIEWS_TO_JUDGE) return "few-reviews";
  return "rated";
}

export function isLowRated(p: Pick<Candidate, "rating" | "ratingCount">): boolean {
  return ratingStanding(p) === "rated" && (p.rating as number) < LOW_RATING_THRESHOLD;
}

/** Every filter except the rating one — the part that is the user's choice. */
function passesChosen(p: Candidate, f: CandidateFilters): boolean {
  if (f.walkCap != null && p.walkMinutes > f.walkCap) return false;
  if (f.priceCap != null && p.priceLevel != null && p.priceLevel > f.priceCap) return false;
  if (f.openOnly && p.open === false) return false;
  return true;
}

/** Pool → what the list shows. Order is preserved. */
export function filterCandidates<P extends Candidate>(
  all: P[],
  f: CandidateFilters = {},
): CandidateView<P> {
  const visible: P[] = [];
  const lowRated: P[] = [];
  for (const p of all) {
    if (!passesChosen(p, f)) continue;
    const low = isLowRated(p);
    if (low) lowRated.push(p);
    if (!low || f.showLowRated) visible.push(p);
  }
  return { visible, lowRated };
}

/** Cheapest to undo first when two lifts bring back the same number. */
const TIE_ORDER: RelaxationKind[] = ["openOnly", "priceCap", "walkCap", "lowRated"];

/**
 * Which single filter to lift to get places back, biggest gain first — the
 * same question `shared/spinBlock.ts` answers for the wheel. None of these
 * needs a request; the caller offers "search farther" after them.
 */
export function relaxations<P extends Candidate>(all: P[], f: CandidateFilters = {}): Relaxation[] {
  const now = filterCandidates(all, f).visible.length;
  const lifted: Record<RelaxationKind, CandidateFilters | null> = {
    openOnly: f.openOnly ? { ...f, openOnly: false } : null,
    priceCap: f.priceCap != null ? { ...f, priceCap: null } : null,
    walkCap: f.walkCap != null ? { ...f, walkCap: null } : null,
    lowRated: f.showLowRated ? null : { ...f, showLowRated: true },
  };
  const out: Relaxation[] = [];
  for (const kind of TIE_ORDER) {
    const g = lifted[kind];
    if (!g) continue;
    const gain = filterCandidates(all, g).visible.length - now;
    if (gain > 0) out.push({ kind, gain });
  }
  // Array.prototype.sort is stable, so equal gains keep TIE_ORDER.
  return out.sort((a, b) => b.gain - a.gain);
}

/** The band edge a walk time falls under, or null past the last band. */
export function walkBand(minutes: number): number | null {
  for (const edge of WALK_BANDS) if (minutes <= edge) return edge;
  return null;
}

/**
 * Add a later page to the pool, in walk order. Places already held keep their
 * data and their order relative to each other — a later page must not rewrite
 * a card someone is looking at. Arrivals slot in by walk time rather than
 * appending: pages are ranked by straight-line distance but re-sorted by
 * ROUTED time, so page two can hold a place nearer than the end of page one.
 */
export function mergeCandidatePages<P extends Candidate>(held: P[], incoming: P[]): P[] {
  const seen = new Set(held.map((p) => p.placeId));
  const out = held.slice();
  for (const p of incoming) {
    if (seen.has(p.placeId)) continue;
    seen.add(p.placeId);
    out.push(p);
  }
  // Stable: equal walk times keep held-before-arrival order.
  return out.sort((a, b) => a.walkMinutes - b.walkMinutes);
}

/** The wheel: ticked AND visible, in visible order. */
export function onWheel<P extends Candidate>(visible: P[], selected: ReadonlySet<string>): P[] {
  return visible.filter((p) => selected.has(p.placeId));
}

/**
 * Which newly arrived places come pre-ticked. Only enough to bring the wheel up
 * to `target`: when someone asks for more places they are asking for more to
 * CHOOSE from, so a wheel that is already full gets them unticked. Never past
 * the wheel's cap.
 */
export function arrivalTicks(
  arrivals: Candidate[],
  currentOnWheel: number,
  target: number = DEFAULT_PICK_COUNT,
): string[] {
  const room = Math.min(target, MAX_SEGMENTS) - currentOnWheel;
  return room > 0 ? preselectPlaceIds(arrivals, room, currentOnWheel) : [];
}
