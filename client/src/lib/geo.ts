/**
 * One geolocation fix, shared for the page session.
 *
 * Several places now want "where is the user" — the first-run flow, ADD NEARBY,
 * and the name search in the add-restaurant form. Each asking the browser
 * separately means repeated permission prompts and repeated waits for a fix, so
 * the resolved position is cached here in module scope.
 *
 * Deliberately NOT persisted: it's a convenience for the current visit, not
 * stored location data. Reloading the page asks again.
 */

export type Coords = { lat: number; lng: number };

export type GeoFailure = "unsupported" | "denied" | "failed";

export class GeoError extends Error {
  constructor(readonly kind: GeoFailure) {
    super(kind);
    this.name = "GeoError";
  }
}

const cache: { coords: Coords | null } = { coords: null };

/** The last known position, if this session already has one. Never prompts. */
export function cachedCoords(): Coords | null {
  return cache.coords;
}

/**
 * Resolve the user's position, reusing this session's fix when there is one.
 * Rejects with a `GeoError` carrying why, so callers can tell "they said no"
 * (offer the manual path) from "it broke" (offer a retry).
 */
export function requestCoords(): Promise<Coords> {
  if (cache.coords) return Promise.resolve(cache.coords);
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new GeoError("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cache.coords = at;
        resolve(at);
      },
      (err) => reject(new GeoError(err.code === err.PERMISSION_DENIED ? "denied" : "failed")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
