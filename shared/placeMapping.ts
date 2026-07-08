/**
 * Pure mapping from a place provider's raw "nearby search" row into the domain
 * `NearbyPlace` shape that `shared/nearby.ts` ranks and the wheel persists.
 *
 * This is the seam between Google Places' JSON and our wheel: it lives in
 * `shared/*` (with a `.test.ts` sibling) so the provider-shape → domain
 * translation is unit-tested without a network call, and both the server (which
 * fetches) and any client preview import the SAME rules. Walking distance is a
 * straight-line haversine estimate (the P0 approximation) — never shown as
 * radial metres, always converted to walk-minutes via `estimateWalkMinutes`.
 */

import { estimateWalkMinutes, type NearbyPlace } from "./nearby";

export interface LatLng {
  lat: number;
  lng: number;
}

/** The subset of a Google Places nearby-search result row we consume. */
export interface ProviderPlace {
  place_id?: string;
  name?: string;
  vicinity?: string;
  formatted_address?: string;
  price_level?: number;
  business_status?: string;
  types?: string[];
  opening_hours?: { open_now?: boolean };
  geometry?: { location?: LatLng };
}

/** A ranked/rendered place plus the fields the `restaurants` row persists. */
export interface MappedPlace extends NearbyPlace {
  id: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  cuisine: string | null;
  priceLevel: number | null;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Map a Google Places `types[]` entry to one of our cuisine labels. First match
 * wins; unknown/generic types ("restaurant", "food", "point_of_interest") map to
 * null so we never invent a cuisine we can't stand behind.
 */
const TYPE_CUISINE: Record<string, string> = {
  japanese_restaurant: "Japanese",
  sushi_restaurant: "Japanese",
  ramen_restaurant: "Japanese",
  chinese_restaurant: "Chinese",
  korean_restaurant: "Korean",
  thai_restaurant: "Thai",
  vietnamese_restaurant: "Vietnamese",
  indian_restaurant: "Indian",
  italian_restaurant: "Italian",
  pizza_restaurant: "Pizza",
  mexican_restaurant: "Mexican",
  american_restaurant: "American",
  french_restaurant: "French",
  mediterranean_restaurant: "Mediterranean",
  greek_restaurant: "Greek",
  spanish_restaurant: "Spanish",
  turkish_restaurant: "Turkish",
  middle_eastern_restaurant: "Middle Eastern",
  seafood_restaurant: "Seafood",
  steak_house: "Steakhouse",
  barbecue_restaurant: "BBQ",
  hamburger_restaurant: "Burgers",
  fast_food_restaurant: "Fast Food",
  breakfast_restaurant: "Breakfast",
  brunch_restaurant: "Brunch",
  vegetarian_restaurant: "Vegetarian",
  vegan_restaurant: "Vegan",
  sandwich_shop: "Sandwiches",
  cafe: "Cafe",
  coffee_shop: "Cafe",
  bakery: "Bakery",
};

/** First recognised cuisine among a place's types, else null. */
export function cuisineFromTypes(types: string[] | null | undefined): string | null {
  if (!types) return null;
  for (const t of types) {
    const c = TYPE_CUISINE[t];
    if (c) return c;
  }
  return null;
}

/**
 * Normalise a provider `price_level` (Google reports 0..4) onto our 1..4 scale;
 * null when the provider doesn't report it. 0 ("free") collapses to 1 ($).
 */
export function normalizePriceLevel(level: number | null | undefined): number | null {
  if (level == null || Number.isNaN(level)) return null;
  return Math.min(4, Math.max(1, Math.round(level)));
}

/**
 * Raw provider row → `MappedPlace`. Distance is haversine from the search origin
 * (the caller's location) converted to walk-minutes; a permanently/temporarily
 * closed business is treated as `open: false` (a soft signal the ranker sinks,
 * never a hard filter — see `shared/nearby.ts`).
 */
export function toNearbyPlace(raw: ProviderPlace, origin: LatLng): MappedPlace {
  const loc = raw.geometry?.location ?? null;
  const distanceMeters = loc ? Math.round(haversineMeters(origin, loc)) : null;
  const walkMinutes = distanceMeters == null ? 0 : estimateWalkMinutes(distanceMeters);

  let open: boolean | undefined = raw.opening_hours?.open_now;
  if (raw.business_status && raw.business_status !== "OPERATIONAL") open = false;

  const placeId = raw.place_id ?? "";
  return {
    id: placeId,
    placeId,
    name: raw.name ?? "Unnamed place",
    walkMinutes,
    distanceMeters,
    cuisine: cuisineFromTypes(raw.types),
    priceLevel: normalizePriceLevel(raw.price_level),
    open,
    chain: null,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    address: raw.vicinity ?? raw.formatted_address ?? null,
  };
}

/**
 * Map a page of raw provider rows to `MappedPlace[]`, dropping rows without a
 * usable place id (nothing we could persist or de-duplicate on).
 */
export function mapProviderResults(rows: ProviderPlace[], origin: LatLng): MappedPlace[] {
  return rows.filter((r) => r.place_id).map((r) => toNearbyPlace(r, origin));
}
