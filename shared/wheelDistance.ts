/**
 * Pure decision logic for per-wheel distance mode (server/distance.ts is the
 * impure orchestration layer: fetches restaurants, calls the place provider,
 * persists results). Kept separate and tested so "which restaurants need
 * geocoding vs are ready vs can't be located" and "how to read a Distance
 * Matrix element" don't get buried inside fetch/DB calls.
 */

/** The subset of a restaurant row this module needs to decide what to do with it. */
export interface DistanceCandidate {
  id: number;
  lat: number | string | null;
  lng: number | string | null;
  mapUrl: string | null;
}

export interface DistancePartition {
  /** Already has coordinates — goes straight into the Distance Matrix batch. */
  ready: { id: number; lat: number; lng: number }[];
  /** Has a saved Maps link but no coordinates yet — resolve once, then cache. */
  needsGeocode: { id: number; mapUrl: string }[];
  /** Neither — walkSeconds stays null, shown as "no location". */
  unlocatable: number[];
}

/** decimal columns come back from mysql2/drizzle as strings. */
function toNum(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function partitionForDistance(restaurants: DistanceCandidate[]): DistancePartition {
  const ready: DistancePartition["ready"] = [];
  const needsGeocode: DistancePartition["needsGeocode"] = [];
  const unlocatable: number[] = [];
  for (const r of restaurants) {
    const lat = toNum(r.lat);
    const lng = toNum(r.lng);
    if (lat != null && lng != null) {
      ready.push({ id: r.id, lat, lng });
    } else if (r.mapUrl) {
      needsGeocode.push({ id: r.id, mapUrl: r.mapUrl });
    } else {
      unlocatable.push(r.id);
    }
  }
  return { ready, needsGeocode, unlocatable };
}

/** Split into groups of at most `size`, preserving order. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Reads Distance Matrix elements (aligned 1:1 with the destinations sent) into
 *  walking seconds, or null for any element that failed. */
export function extractWalkSeconds(
  elements: { status?: string; duration?: { value?: number } }[],
): (number | null)[] {
  return elements.map((el) =>
    el?.status === "OK" && el.duration?.value != null ? el.duration.value : null,
  );
}
