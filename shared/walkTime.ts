/**
 * Merge real walking times (Google Distance Matrix, mode=walking) onto ranked
 * nearby places — the P1 upgrade over the haversine estimate the design spec
 * planned for. Pure + tested; the server fetches, this module decides.
 *
 * Degradation contract: the haversine estimate is never thrown away. A failed
 * request, a failed element (status !== "OK"), or a coordless place simply
 * keeps its estimate, and every place is flagged `walkSource` so the UI can
 * mark estimates honestly ("~7 min walk") while route times read plain.
 */

export type WalkSource = "route" | "estimate";

/** The subset of a Distance Matrix element this module consumes. */
export interface MatrixElement {
  status?: string;
  duration?: { value?: number };
  distance?: { value?: number };
}

interface Walkable {
  name: string;
  walkMinutes: number;
  distanceMeters?: number | null;
  lat?: number | string | null;
  lng?: number | string | null;
}

const hasCoords = (p: Walkable): boolean => p.lat != null && p.lng != null;

/** "lat,lng" strings for the coord-bearing places, in place order — the exact
 *  destination list a Distance Matrix request should carry. */
export function routableCoords(places: Walkable[]): string[] {
  return places.filter(hasCoords).map((p) => `${p.lat},${p.lng}`);
}

/**
 * Apply matrix elements (aligned with `routableCoords(places)` order) onto the
 * places, then re-sort nearest-first by the refined times (name-stable, same
 * ordering rule as dedupeChains). Elements are consumed only by coord-bearing
 * places, so a coordless row never shifts the alignment.
 */
export function mergeWalkTimes<T extends Walkable>(
  places: T[],
  elements: MatrixElement[],
): (T & { walkSource: WalkSource })[] {
  let cursor = 0;
  const merged = places.map((p) => {
    if (!hasCoords(p)) return { ...p, walkSource: "estimate" as const };
    const el = elements[cursor++];
    const seconds = el?.status === "OK" ? el.duration?.value : undefined;
    if (seconds == null) return { ...p, walkSource: "estimate" as const };
    return {
      ...p,
      walkMinutes: Math.max(1, Math.round(seconds / 60)),
      distanceMeters: el?.distance?.value ?? p.distanceMeters ?? null,
      walkSource: "route" as const,
    };
  });
  return merged.sort((a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name));
}
