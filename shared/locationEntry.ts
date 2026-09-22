/**
 * Which way the location picker should lead.
 *
 * `LocationPicker` offers three routes to the same result — browser
 * geolocation, searching for a place by name, and pasting a Maps link — and
 * until now it always led with geolocation and folded the other two behind
 * "Or set it another way". For someone who has permanently denied location
 * that is a primary button which CANNOT work: they tap it, it fails, and only
 * then do the two working routes appear. The browser will tell us this before
 * we ask (`navigator.permissions`), and nothing was asking.
 *
 * The decision is here rather than in the component so the fail-safe rule has
 * a test: an unknown state must resolve to geolocation-first. Older Safari
 * does not answer `permissions.query({ name: "geolocation" })` at all, and
 * "we could not find out" is not the same as "they said no" — treating it as
 * denied would demote the primary path for a far larger group than the people
 * who actually refused.
 */

/** Browser permission state, plus the case where we could not find out. */
export type GeoPermission = "granted" | "prompt" | "denied" | "unknown";

export type LocationEntryMode =
  /** Big "use my location" button; the manual routes stay available below. */
  | "geolocation-first"
  /** Search and Maps-link up front; geolocation is not offered as the action. */
  | "manual-first";

export function locationEntryMode(permission: GeoPermission): LocationEntryMode {
  return permission === "denied" ? "manual-first" : "geolocation-first";
}
