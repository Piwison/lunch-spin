/**
 * Distance-mode orchestration: fetches a wheel's restaurants, geocodes the
 * ones that only have a saved Maps link, batches Distance Matrix requests
 * against the wheel's single origin, and persists walkSeconds. The pure
 * decisions (who needs what, how to chunk, how to read an element) live in
 * shared/wheelDistance.ts; this module is the impure glue (DB + fetch).
 *
 * Best-effort throughout: any place-provider failure leaves affected
 * restaurants' walkSeconds as they were rather than throwing, so a Distance
 * Matrix hiccup never breaks the caller (adding a restaurant, saving wheel
 * settings).
 */

import { chunk, extractWalkSeconds, partitionForDistance } from "@shared/wheelDistance";
import {
  getRestaurantById,
  getRestaurantsByWheel,
  getWheelById,
  setRestaurantCoords,
  setRestaurantWalkSeconds,
} from "./db";
import { isPlacesConfigured, resolvePlaceLink, walkingMatrix } from "./places";

// Distance Matrix accepts up to 25 destinations per request (single origin).
const MATRIX_CHUNK_SIZE = 25;

async function activeOrigin(wheelId: number): Promise<{ lat: number; lng: number } | null> {
  const wheel = await getWheelById(wheelId);
  if (!wheel || !wheel.distanceEnabled || wheel.originLat == null || wheel.originLng == null) return null;
  if (!isPlacesConfigured()) return null;
  return { lat: Number(wheel.originLat), lng: Number(wheel.originLng) };
}

/** Recompute every restaurant on a wheel against its current origin. No-op
 *  (returns zeros) when distance mode is off, has no origin, or the place
 *  provider isn't configured — callers don't need to check first. */
export async function recomputeWheelDistances(wheelId: number): Promise<{ computed: number; unlocatable: number }> {
  const origin = await activeOrigin(wheelId);
  if (!origin) return { computed: 0, unlocatable: 0 };

  const restaurants = await getRestaurantsByWheel(wheelId);
  const { ready, needsGeocode, unlocatable } = partitionForDistance(restaurants);

  for (const r of needsGeocode) {
    try {
      const place = await resolvePlaceLink(r.mapUrl);
      if (place?.lat != null && place?.lng != null) {
        await setRestaurantCoords(r.id, place.lat, place.lng, place.address);
        ready.push({ id: r.id, lat: place.lat, lng: place.lng });
      } else {
        unlocatable.push(r.id);
      }
    } catch {
      unlocatable.push(r.id);
    }
  }

  for (const id of unlocatable) {
    await setRestaurantWalkSeconds(id, null);
  }

  let computed = 0;
  for (const batch of chunk(ready, MATRIX_CHUNK_SIZE)) {
    try {
      const elements = await walkingMatrix(origin, batch.map((r) => `${r.lat},${r.lng}`));
      const seconds = extractWalkSeconds(elements);
      for (let i = 0; i < batch.length; i++) {
        await setRestaurantWalkSeconds(batch[i]!.id, seconds[i] ?? null);
        if (seconds[i] != null) computed++;
      }
    } catch {
      // This batch's walkSeconds stay whatever they were — stale, not wrong.
    }
  }

  return { computed, unlocatable: unlocatable.length };
}

/** Compute (or refresh) walking time for a single restaurant — the "auto for
 *  each newly-added restaurant" behavior. Same no-op contract as above. */
export async function maybeComputeOneDistance(wheelId: number, restaurantId: number): Promise<void> {
  const origin = await activeOrigin(wheelId);
  if (!origin) return;

  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) return;

  const { ready, needsGeocode } = partitionForDistance([restaurant]);
  let target = ready[0];
  if (!target && needsGeocode[0]) {
    try {
      const place = await resolvePlaceLink(needsGeocode[0].mapUrl);
      if (place?.lat != null && place?.lng != null) {
        await setRestaurantCoords(restaurantId, place.lat, place.lng, place.address);
        target = { id: restaurantId, lat: place.lat, lng: place.lng };
      }
    } catch {
      // stays unlocatable
    }
  }
  if (!target) return;

  try {
    const elements = await walkingMatrix(origin, [`${target.lat},${target.lng}`]);
    const [seconds] = extractWalkSeconds(elements);
    await setRestaurantWalkSeconds(restaurantId, seconds ?? null);
  } catch {
    // leave walkSeconds as-is
  }
}
