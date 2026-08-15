/**
 * Name a wheel after the neighbourhood it was built in.
 *
 * Onboarding creates the user's first wheel from a nearby search, and asking
 * them to type a name before anything happens is exactly the friction that
 * flow exists to remove. So we infer one from the addresses the place provider
 * already returned: "Lunch near 信義區" beats both "Lunch near me" and an empty
 * required text field.
 *
 * Deliberately conservative. This is a nicety, not a correctness-critical
 * value — when the addresses don't agree on one area (a search straddling
 * several districts) it returns null and the caller falls back to a generic
 * name. The user can rename the wheel in settings either way.
 *
 * Pure + unit-tested (repo TDD seam in shared/*).
 */

/** Share of usable addresses that must agree before we'll use an area name. */
const CONSENSUS = 0.5;

/** Wheel names are stored in a varchar(128). */
const MAX_WHEEL_NAME = 128;

const CJK = "\\u4e00-\\u9fff";

/**
 * A district (區/鄉/鎮), which must follow a city marker, a digit, whitespace or
 * the string start — otherwise the trailing character of 台北市 gets swallowed
 * into the match and yields "市信義區".
 */
const DISTRICT_RE = new RegExp(`(?:^|[市縣\\s0-9])([${CJK}]{2,3})([區鄉鎮])`);

/** A city (市/縣) — the coarser fallback when no district is present. */
const CITY_RE = new RegExp(`([${CJK}]{2,3})([市縣])`);

/** Pull the most useful area token out of one address, or null. */
function areaOf(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // CJK first: a district is more useful than the city containing it.
  const district = DISTRICT_RE.exec(trimmed);
  if (district) return district[1] + district[2];
  const city = CITY_RE.exec(trimmed);
  if (city) return city[1] + city[2];

  // Latin: "123 Main St, Brooklyn, NY 11201" — the first segment is the street
  // and the last is region/postcode, so the locality is what follows the street.
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const locality = parts[1]!.replace(/[\s,]*\d[\d\s-]*$/, "").trim();
  return locality.length >= 2 ? locality : null;
}

/**
 * The area most of these addresses share, or null when they don't agree.
 * Unusable rows (null/empty/unparseable) are ignored rather than counted
 * against the consensus.
 */
export function deriveAreaName(addresses: (string | null | undefined)[]): string | null {
  const areas = addresses
    .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    .map(areaOf)
    .filter((a): a is string => a !== null);
  if (areas.length === 0) return null;

  const counts = new Map<string, number>();
  for (const a of areas) counts.set(a, (counts.get(a) ?? 0) + 1);

  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, area) => {
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  });
  return bestCount / areas.length >= CONSENSUS ? best : null;
}

/** The wheel name shown after onboarding. Always safe to insert. */
export function wheelNameForArea(area: string | null): string {
  const name = area ? `Lunch near ${area}` : "Lunch near me";
  return name.length > MAX_WHEEL_NAME ? name.slice(0, MAX_WHEEL_NAME) : name;
}
