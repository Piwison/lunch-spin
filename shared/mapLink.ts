/**
 * Pure parser for Google Maps share links → the signal the server needs to look
 * the place up (a place id, a text query, and/or coordinates). Network-free and
 * tested; short links (maps.app.goo.gl / goo.gl) are opaque and can only be
 * resolved by following their redirect server-side, so we just flag them.
 *
 * Handles the common shapes a "share" or address-bar copy produces:
 *   …/maps/place/Some+Name/@37.7,-122.4,17z/data=…!1s…       (name + coords)
 *   …/maps/search/?api=1&query=Name&query_place_id=ChIJ…      (place id — best)
 *   …/maps?q=place_id:ChIJ…                                    (place id)
 *   …/maps?q=Some+Name  /  ?q=37.7,-122.4                      (text or coords)
 *   https://maps.app.goo.gl/xyz  /  https://goo.gl/maps/xyz    (short → expand)
 */

export type MapLink =
  | { kind: "short"; url: string }
  | { kind: "placeId"; placeId: string; name: string | null; lat: number | null; lng: number | null }
  | { kind: "text"; query: string; lat: number | null; lng: number | null }
  | { kind: "coords"; lat: number; lng: number }
  | null;

const SHORT_HOSTS = /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$|(^|\.)google\.com$|(^|\.)maps\.google\.[a-z.]+$/i;

const isLat = (n: number) => Number.isFinite(n) && Math.abs(n) <= 90;
const isLng = (n: number) => Number.isFinite(n) && Math.abs(n) <= 180;

/** "37.77,-122.41" → coords, else null. */
function parseLatLng(s: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  return isLat(lat) && isLng(lng) ? { lat, lng } : null;
}

/** Best-effort place-id extraction from a maps URL's params/path. */
function extractPlaceId(u: URL): string | null {
  const qpid = u.searchParams.get("query_place_id") || u.searchParams.get("place_id");
  if (qpid) return qpid;
  const q = u.searchParams.get("q") ?? "";
  const m = /^place_id:(.+)$/i.exec(q.trim());
  return m ? m[1]! : null;
}

/** Coordinates from an `@lat,lng` path chunk or `!3dlat!4dlng` data blob. */
function extractCoords(u: URL): { lat: number; lng: number } | null {
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u.pathname + u.search);
  if (at) {
    const lat = parseFloat(at[1]!);
    const lng = parseFloat(at[2]!);
    if (isLat(lat) && isLng(lng)) return { lat, lng };
  }
  const data = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u.pathname + u.search);
  if (data) {
    const lat = parseFloat(data[1]!);
    const lng = parseFloat(data[2]!);
    if (isLat(lat) && isLng(lng)) return { lat, lng };
  }
  return null;
}

/** Human place name from a `/maps/place/<NAME>/…` path segment, decoded. */
function extractPlaceName(u: URL): string | null {
  const m = /\/maps\/place\/([^/@]+)/.exec(u.pathname);
  if (!m) return null;
  try {
    const name = decodeURIComponent(m[1]!.replace(/\+/g, " ")).trim();
    return name && !parseLatLng(name) ? name : null;
  } catch {
    return null;
  }
}

/** Parse a Google Maps link into a lookup signal (see MapLink). */
export function parseMapLink(input: string): MapLink {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  if (SHORT_HOSTS.test(u.hostname)) return { kind: "short", url: u.toString() };
  if (!GOOGLE_HOST.test(u.hostname)) return null;

  const coords = extractCoords(u);

  const placeId = extractPlaceId(u);
  if (placeId) {
    return { kind: "placeId", placeId, name: extractPlaceName(u), lat: coords?.lat ?? null, lng: coords?.lng ?? null };
  }

  // Text query: the /place/ name, then ?q / ?query (unless it's really coords).
  const nameFromPath = extractPlaceName(u);
  const qParam = (u.searchParams.get("q") || u.searchParams.get("query") || "").trim();
  const query = nameFromPath ?? (qParam && !parseLatLng(qParam) ? qParam : null);
  if (query) {
    return { kind: "text", query, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
  }

  // Only coordinates (a dropped pin): usable as a location but has no name.
  const qCoords = qParam ? parseLatLng(qParam) : null;
  const only = coords ?? qCoords;
  if (only) return { kind: "coords", lat: only.lat, lng: only.lng };

  return null;
}
