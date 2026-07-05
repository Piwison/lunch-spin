/**
 * Direct Google Places API integration for the "located wheel" nearby search.
 *
 * Replaces the old Manus forge-proxy call (`server/_core/map.ts`) — dead since
 * this project migrated off Manus (see PRODUCTION.md: "Forge/storage env vars
 * are not required"). This talks to Google's Places API directly with a
 * self-hosted API key, the same pattern as this repo's
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Deliberately lives outside
 * `server/_core/` (a guarded auth/session-contract directory) and reads its own
 * env var directly rather than adding to `_core/env.ts`.
 */

import type { ProviderPlace } from "@shared/placeMapping";

const NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

export interface NearbySearchResponse {
  results?: ProviderPlace[];
  status?: string;
  error_message?: string;
}

/** True once GOOGLE_MAPS_API_KEY is set (Places API enabled on that key). */
export function isPlacesConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

/** Nearby restaurants around a point, straight from Google's Places API. */
export async function searchNearbyRestaurants(
  lat: number,
  lng: number,
  radius: number,
  keyword?: string,
): Promise<NearbySearchResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");

  const url = new URL(NEARBY_SEARCH_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("type", "restaurant");
  if (keyword) url.searchParams.set("keyword", keyword);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Google Places API request failed (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as NearbySearchResponse;
}
