/**
 * The query string for one Google Places (legacy) Nearby Search request.
 *
 * Two rankings, and they take different parameters:
 *
 *   - `prominence` (Google's default) needs a `radius` and returns the 20 most
 *     "notable" places inside it. ADD NEARBY uses it, and widens by doubling
 *     the radius.
 *   - `distance` must NOT carry a radius (Google answers INVALID_REQUEST) and
 *     returns the 20 nearest. First-run uses it: measured at 內湖 on
 *     2026-09-22, the two lists shared 2 of 20 places, and only distance found
 *     the neighbourhood lunch spots (BACKLOG.md 1a).
 *
 * A follow-up page is its own shape: Google repeats the original search from
 * the token and ignores every other parameter, so only the token is sent.
 *
 * The API key is added by the caller; it is not part of the query's meaning.
 */

import { DEFAULT_RADIUS_M } from "./nearby";

export type RankBy = "prominence" | "distance";

export interface NearbyQuery {
  lat: number;
  lng: number;
  rankBy?: RankBy;
  /** Metres; prominence only. Ignored (and never sent) for distance. */
  radius?: number | null;
  keyword?: string | null;
  /** `next_page_token` from a previous response. */
  pageToken?: string | null;
}

export function nearbySearchParams(q: NearbyQuery): [string, string][] {
  if (q.pageToken) return [["pagetoken", q.pageToken]];

  const out: [string, string][] = [["location", `${q.lat},${q.lng}`]];
  if (q.rankBy === "distance") out.push(["rankby", "distance"]);
  else out.push(["radius", String(q.radius ?? DEFAULT_RADIUS_M)]);
  out.push(["type", "restaurant"]);
  const keyword = q.keyword?.trim();
  if (keyword) out.push(["keyword", keyword]);
  return out;
}
