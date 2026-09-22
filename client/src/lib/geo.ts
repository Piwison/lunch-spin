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

import type { GeoPermission } from "@shared/locationEntry";

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

/**
 * Watch whether geolocation will actually work, before asking for it.
 *
 * `requestCoords` can only tell you after the fact, which is why the picker
 * used to offer a primary button that was guaranteed to fail for anyone who
 * had permanently denied the permission. This answers the question up front —
 * and keeps answering it, because the state changes: someone who re-enables
 * location in their browser settings should get the button back without a
 * reload (the same reason presence subscribes to `visibilitychange`).
 *
 * Every branch degrades to "unknown" rather than "denied":
 *   - `navigator.permissions` is absent (older Safari, some webviews)
 *   - `query` rejects because the "geolocation" name is unsupported
 *   - the state is a value this build does not recognise
 * `shared/locationEntry.ts` turns "unknown" back into geolocation-first, so a
 * browser that cannot answer keeps the normal path.
 *
 * Returns an unsubscribe. Safe to call during render-effect setup.
 */
export function watchGeoPermission(onChange: (permission: GeoPermission) => void): () => void {
  let cancelled = false;
  let status: PermissionStatus | null = null;

  const publish = () => {
    if (cancelled || !status) return;
    onChange(normalizePermission(status.state));
  };

  const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (!permissions?.query) {
    onChange("unknown");
    return () => {};
  }

  permissions
    // `PermissionName` in lib.dom does not include "geolocation" in every TS
    // version, but the browsers that implement the API all accept it.
    .query({ name: "geolocation" as PermissionName })
    .then((result) => {
      if (cancelled) return;
      status = result;
      publish();
      result.addEventListener("change", publish);
    })
    .catch(() => {
      if (!cancelled) onChange("unknown");
    });

  return () => {
    cancelled = true;
    status?.removeEventListener("change", publish);
  };
}

function normalizePermission(state: string): GeoPermission {
  return state === "granted" || state === "prompt" || state === "denied" ? state : "unknown";
}
