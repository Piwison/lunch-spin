/**
 * Team taste profile — turns the star ratings the team already leaves into a
 * legible summary: the overall mood, the crowd-favourite places, and which
 * cuisines the team leans toward or cools on. Pure + tested; the server feeds it
 * per-restaurant rollups (shared/restaurantRating summarizeRatings) enriched with
 * each place's name + cuisine, and the History-tab card renders the result.
 */

export type TasteItem = {
  restaurantId: number;
  name: string;
  cuisine: string | null;
  average: number; // team average stars for this place
  count: number; //   how many members rated it
};

export type PlaceTaste = { restaurantId: number; name: string; average: number; count: number };
export type CuisineTaste = { cuisine: string; average: number; count: number };

export type TasteProfile = {
  totalRatings: number;
  overallAverage: number | null;
  topPlaces: PlaceTaste[];
  leans: CuisineTaste[];
  cools: CuisineTaste[];
  hasEnoughData: boolean;
};

// Anti-noise thresholds: a place/cuisine needs a minimum sample before it earns
// a spot, and the whole card stays a teaser until the wheel has some ratings.
const MIN_PLACE_COUNT = 2;
const MIN_CUISINE_COUNT = 3;
const MIN_TOTAL_FOR_CARD = 5;
const LEAN_AT = 3.5; // avg ≥ → "leans toward"
const COOL_AT = 2.5; // avg ≤ → "cools on"

/** Aggregate per-place rating rollups into the team taste profile. */
export function buildTasteProfile(items: TasteItem[]): TasteProfile {
  const totalRatings = items.reduce((sum, i) => sum + i.count, 0);
  const overallAverage =
    totalRatings === 0
      ? null
      : items.reduce((sum, i) => sum + i.average * i.count, 0) / totalRatings;

  const topPlaces: PlaceTaste[] = items
    .filter((i) => i.count >= MIN_PLACE_COUNT)
    .sort((a, b) => b.average - a.average || b.count - a.count || a.restaurantId - b.restaurantId)
    .slice(0, 3)
    .map((i) => ({ restaurantId: i.restaurantId, name: i.name, average: i.average, count: i.count }));

  // Cuisine roll-up: weighted average + total ratings per cuisine.
  const byCuisine = new Map<string, { weighted: number; count: number }>();
  for (const i of items) {
    if (!i.cuisine) continue;
    const e = byCuisine.get(i.cuisine) ?? { weighted: 0, count: 0 };
    e.weighted += i.average * i.count;
    e.count += i.count;
    byCuisine.set(i.cuisine, e);
  }
  const cuisines: CuisineTaste[] = Array.from(byCuisine.entries())
    .filter(([, e]) => e.count >= MIN_CUISINE_COUNT)
    .map(([cuisine, e]) => ({ cuisine, average: e.weighted / e.count, count: e.count }));

  const leans = cuisines
    .filter((c) => c.average >= LEAN_AT)
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, 3);
  const cools = cuisines
    .filter((c) => c.average <= COOL_AT)
    .sort((a, b) => a.average - b.average || b.count - a.count)
    .slice(0, 2);

  return {
    totalRatings,
    overallAverage,
    topPlaces,
    leans,
    cools,
    hasEnoughData: totalRatings >= MIN_TOTAL_FOR_CARD,
  };
}
