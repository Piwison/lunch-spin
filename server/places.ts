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

import { cuisineFromTypes, normalizePriceLevel, type ProviderPlace } from "@shared/placeMapping";
import { parseMapLink } from "@shared/mapLink";
import type { MatrixElement } from "@shared/walkTime";

const NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const PLACE_FIELDS = "place_id,name,geometry,formatted_address,types,price_level";

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

/**
 * Real walking times from one origin to the ranked destinations ("lat,lng"
 * strings, max ~12 — well under the API's 25-per-request cap), via Google's
 * Distance Matrix API with mode=walking. One request per nearby search.
 * Throws on any failure — the caller treats the whole refinement as optional
 * and falls back to the haversine estimates (shared/walkTime.ts contract).
 * Needs "Distance Matrix API" enabled on the same GOOGLE_MAPS_API_KEY.
 */
export async function walkingMatrix(
  origin: { lat: number; lng: number },
  destinations: string[],
): Promise<MatrixElement[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");
  if (destinations.length === 0) return [];

  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", destinations.join("|"));
  url.searchParams.set("mode", "walking");
  url.searchParams.set("units", "metric");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Distance Matrix request failed (${res.status} ${res.statusText})`);
  }
  const data = (await res.json()) as {
    status?: string;
    rows?: { elements?: MatrixElement[] }[];
  };
  if (data.status !== "OK") {
    throw new Error(`Distance Matrix error: ${data.status ?? "unknown"}`);
  }
  return data.rows?.[0]?.elements ?? [];
}

// ── Resolve a pasted Google Maps link → a nameable place ─────────────────────

/** A place resolved from a link, shaped for restaurants.add / addNearby. */
export interface ResolvedPlace {
  placeId: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  cuisine: string | null;
  priceLevel: number | null;
}

// One Google place record (details result / find-place candidate).
interface GooglePlace {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  price_level?: number;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
}

const SHORT_HOSTS = /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;
const GOOGLE_HOSTS = /(^|\.)(google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;

function mapGooglePlace(p: GooglePlace): ResolvedPlace | null {
  if (!p.name) return null;
  const loc = p.geometry?.location;
  return {
    placeId: p.place_id ?? null,
    name: p.name,
    lat: typeof loc?.lat === "number" ? loc.lat : null,
    lng: typeof loc?.lng === "number" ? loc.lng : null,
    address: p.formatted_address ?? null,
    cuisine: cuisineFromTypes(p.types),
    priceLevel: normalizePriceLevel(p.price_level),
  };
}

// Follow a short link's redirects to the canonical maps URL. Host-allowlisted
// on entry AND exit (SSRF guard — we only ever fetch goo.gl/google and only
// trust a google.* final URL), with a short timeout.
async function expandShortLink(url: string): Promise<string | null> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!SHORT_HOSTS.test(host)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal });
    const finalHost = new URL(res.url).hostname;
    if (!GOOGLE_HOSTS.test(finalHost)) return null;
    return res.url;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function placeDetails(placeId: string, apiKey: string): Promise<ResolvedPlace | null> {
  const url = new URL(PLACE_DETAILS_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", PLACE_FIELDS);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Place Details failed (${res.status})`);
  const data = (await res.json()) as { status?: string; result?: GooglePlace };
  if (data.status !== "OK" || !data.result) return null;
  return mapGooglePlace(data.result);
}

async function findPlace(
  text: string,
  bias: { lat: number; lng: number } | null,
  apiKey: string,
): Promise<ResolvedPlace | null> {
  const url = new URL(FIND_PLACE_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("input", text);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", PLACE_FIELDS);
  if (bias) url.searchParams.set("locationbias", `point:${bias.lat},${bias.lng}`);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Find Place failed (${res.status})`);
  const data = (await res.json()) as { status?: string; candidates?: GooglePlace[] };
  if (data.status !== "OK" || !data.candidates?.length) return null;
  return mapGooglePlace(data.candidates[0]!);
}

/**
 * Resolve a pasted Google Maps link into a nameable place. Expands short links,
 * then looks the place up by id (Place Details) or by text (Find Place, biased
 * to any coords in the link). Returns null when the link carries no usable
 * signal or Google can't resolve it. Needs Places API on GOOGLE_MAPS_API_KEY.
 */
export async function resolvePlaceLink(rawUrl: string): Promise<ResolvedPlace | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");

  let parsed = parseMapLink(rawUrl);
  if (parsed?.kind === "short") {
    const expanded = await expandShortLink(parsed.url);
    parsed = expanded ? parseMapLink(expanded) : null;
    if (parsed?.kind === "short") parsed = null; // never expand twice
  }
  if (!parsed) return null;

  if (parsed.kind === "placeId") {
    const byId = await placeDetails(parsed.placeId, apiKey);
    if (byId) return byId;
    // Details can miss (stale id); fall back to the name if the link carried one.
    if (parsed.name) {
      const bias = parsed.lat != null && parsed.lng != null ? { lat: parsed.lat, lng: parsed.lng } : null;
      return findPlace(parsed.name, bias, apiKey);
    }
    return null;
  }
  if (parsed.kind === "text") {
    const bias = parsed.lat != null && parsed.lng != null ? { lat: parsed.lat, lng: parsed.lng } : null;
    return findPlace(parsed.query, bias, apiKey);
  }
  // coords-only (dropped pin): no name to search, nothing to add.
  return null;
}
