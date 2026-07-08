/**
 * Pure ranking + shaping for the "located wheel" (P0).
 *
 * Turns a raw list of nearby places (from a place provider) into wheel segments
 * and their spin weights, applying the rules the design spec calls out:
 *   - chain de-duplication (one entry per brand, nearest wins),
 *   - walking-time ordering (never radial distance),
 *   - soft filters that RE-RANK instead of excluding (the wheel never empties),
 *   - chain demotion (independents ride higher than national chains),
 *   - a low-density signal (caller widens the radius).
 *
 * Server and client both import this — never reimplement the math inline. The
 * server still picks the winner; these weights only bias that pick and shape
 * what's shown. Pure + unit-tested (repo TDD seam in shared/*).
 */

export interface NearbyPlace {
  id: number | string;
  name: string;
  /** Walking minutes — what we show. Distance is never radial on screen. */
  walkMinutes: number;
  cuisine?: string | null;
  /** 1..4 ($ .. $$$$), nullable when the provider doesn't report it. */
  priceLevel?: number | null;
  /** Open-now HINT from the provider. Treated as soft, never a hard filter. */
  open?: boolean;
  /** Brand key when this is a chain location (e.g. "Starbucks"); null = independent. */
  chain?: string | null;
  distanceMeters?: number | null;
}

export interface NearbyFilters {
  /** Minutes; soft — over-walk drops weight, doesn't remove the place. */
  maxWalk?: number | null;
  /** 1..4; soft. */
  maxPrice?: number | null;
  /** Soft — closed places sink but stay on the wheel. */
  openNow?: boolean;
}

export interface RankOptions {
  minSegments?: number;
  maxSegments?: number;
}

export interface RankedWheel<P extends NearbyPlace = NearbyPlace> {
  /** Places to render as wheel segments, nearest-first. */
  segments: P[];
  /** Spin weights aligned with `segments`; every value is > 0. */
  weights: number[];
  /** How many duplicate chain rows were folded away (for the "N grouped" note). */
  chainsGrouped: number;
  /** True when the walkable set is thin — caller should widen the radius. */
  lowDensity: boolean;
}

/** Tunables — one source of truth for callers and tests. */
export const MIN_SEGMENTS = 6;
export const MAX_SEGMENTS = 12;
export const DEFAULT_RADIUS_M = 900;
export const SOFT_FAIL = 0.12; // fails a soft filter (walk / price)
export const CLOSED_FAIL = 0.05; // closed while "open now" is on
export const CHAIN_DEMOTION = 0.5; // national chains ride below independents
export const WALK_METERS_PER_MIN = 80; // ~4.8 km/h

/** Meters → walking minutes (min 1). Never show radial distance. */
export function estimateWalkMinutes(meters: number, metersPerMin = WALK_METERS_PER_MIN): number {
  if (!(meters > 0)) return 0;
  return Math.max(1, Math.round(meters / metersPerMin));
}

/** Human label, e.g. "6 min walk" — "~6 min walk" when it's an estimate
 *  (straight-line haversine) rather than a routed walking time. */
export function formatWalk(minutes: number, approx = false): string {
  return `${approx ? "~" : ""}${Math.max(1, Math.round(minutes))} min walk`;
}

/** True when a set this size should trigger low-density handling. */
export function isLowDensity(count: number, min = MIN_SEGMENTS): boolean {
  return count < min;
}

/**
 * Fold chain duplicates to one entry per brand (the nearest wins); keep every
 * independent. Result is sorted nearest-first, then by name for stability.
 */
export function dedupeChains<P extends NearbyPlace>(places: P[]): P[] {
  const bestByChain = new Map<string, P>();
  const out: P[] = [];
  for (const p of places) {
    if (p.chain) {
      const cur = bestByChain.get(p.chain);
      if (!cur || p.walkMinutes < cur.walkMinutes) bestByChain.set(p.chain, p);
    } else {
      out.push(p);
    }
  }
  out.push(...Array.from(bestByChain.values()));
  return out.sort((a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name));
}

/**
 * Soft-filter multiplier. Reduces weight when a place fails a filter but never
 * to zero — a filtered-out place sinks on the wheel, it does not disappear.
 */
export function filterWeight(p: NearbyPlace, f: NearbyFilters = {}): number {
  let w = 1;
  if (f.maxWalk != null && p.walkMinutes > f.maxWalk) w *= SOFT_FAIL;
  if (f.maxPrice != null && p.priceLevel != null && p.priceLevel > f.maxPrice) w *= SOFT_FAIL;
  if (f.openNow && p.open === false) w *= CLOSED_FAIL;
  return w;
}

/** Full spin weight: soft filters × chain demotion. Always > 0. */
export function spinWeight(p: NearbyPlace, f: NearbyFilters = {}): number {
  return filterWeight(p, f) * (p.chain ? CHAIN_DEMOTION : 1);
}

/**
 * Raw nearby places → wheel segments + weights + flags. Dedupe chains, cap to a
 * spinnable count (nearest-first), weight each segment, and flag low density.
 * Never empties the wheel while any place exists.
 */
export function rankNearby<P extends NearbyPlace>(
  places: P[],
  filters: NearbyFilters = {},
  opts: RankOptions = {},
): RankedWheel<P> {
  const min = opts.minSegments ?? MIN_SEGMENTS;
  const max = opts.maxSegments ?? MAX_SEGMENTS;
  const deduped = dedupeChains(places);
  const chainsGrouped = places.length - deduped.length;
  const segments = deduped.slice(0, max);
  const weights = segments.map((p) => spinWeight(p, filters));
  return { segments, weights, chainsGrouped, lowDensity: isLowDensity(segments.length, min) };
}
