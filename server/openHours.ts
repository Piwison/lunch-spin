/**
 * Opening-hours refresh orchestration: fetch weekly hours from Google Places for
 * the wheel's provider-sourced restaurants and cache them on the row.
 *
 * Best-effort by contract — every failure path is swallowed and logged, and the
 * caller is never made to fail because hours couldn't be fetched. A restaurant
 * with no hours stays "unknown", which `shared/openHours.ts` keeps on the wheel.
 * (Same graceful-degradation shape as server/distance.ts.)
 */

import { getRestaurantsNeedingHours, setRestaurantHours, setRestaurantPlaceId } from "./db";
import { fetchPlaceHours, isPlacesConfigured, resolvePlaceLink } from "./places";

/** Re-fetch hours older than this (opening hours drift; a week is plenty fresh). */
export const HOURS_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Cap per call so one wheel can't fan out into an unbounded number of requests. */
const MAX_PER_RUN = 25;

export interface HoursRefreshResult {
  updated: number;
  /** True when we tried to reach Places and it errored (vs nothing to do). */
  providerFailed: boolean;
}

/**
 * Refresh stale/missing hours for a wheel. Returns how many rows were updated and
 * whether the provider itself failed, so callers can tell "nothing needed doing"
 * apart from "we tried and the API is misconfigured" (the distinction that made
 * the distance-mode failure invisible for a whole round).
 */
export async function refreshWheelHours(wheelId: number): Promise<HoursRefreshResult> {
  if (!isPlacesConfigured()) return { updated: 0, providerFailed: false };
  let targets: { id: number; placeId: string | null; mapUrl: string | null }[];
  try {
    targets = (await getRestaurantsNeedingHours(wheelId, HOURS_STALE_AFTER_MS)).slice(0, MAX_PER_RUN);
  } catch (err) {
    console.error("[openHours] failed to list restaurants needing hours", err);
    return { updated: 0, providerFailed: false };
  }
  if (targets.length === 0) return { updated: 0, providerFailed: false };

  let updated = 0;
  let providerFailed = false;
  for (const t of targets) {
    try {
      // Restaurants added by hand (including via a pasted Maps link) have no
      // placeId, so resolve one from the saved link first and remember it.
      let placeId = t.placeId;
      if (!placeId && t.mapUrl) {
        const resolved = await resolvePlaceLink(t.mapUrl);
        if (resolved?.placeId) {
          placeId = resolved.placeId;
          await setRestaurantPlaceId(t.id, placeId);
        }
      }
      if (!placeId) continue; // nothing to look up — stays "unknown", stays on the wheel
      const hours = await fetchPlaceHours(placeId);
      // A place with genuinely no published hours: stamp hoursUpdatedAt anyway so
      // we don't re-request it on every spin, but leave the periods null/unknown.
      await setRestaurantHours(t.id, hours?.periods ?? null, hours?.utcOffsetMinutes ?? null);
      updated += 1;
    } catch (err) {
      providerFailed = true;
      console.error(`[openHours] refresh failed for restaurant ${t.id}`, err);
    }
  }
  return { updated, providerFailed };
}

/** One restaurant, right after it's added. Never throws. */
export async function maybeFetchOneRestaurantHours(restaurantId: number, placeId: string | null) {
  if (!placeId || !isPlacesConfigured()) return;
  try {
    const hours = await fetchPlaceHours(placeId);
    await setRestaurantHours(restaurantId, hours?.periods ?? null, hours?.utcOffsetMinutes ?? null);
  } catch (err) {
    console.error(`[openHours] initial fetch failed for restaurant ${restaurantId}`, err);
  }
}
