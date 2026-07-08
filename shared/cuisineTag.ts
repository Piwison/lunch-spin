/**
 * Map a provider cuisine label (shared/placeMapping.ts) onto one of the
 * wheel's existing cuisine/food_type tags — the seam that makes a
 * nearby-added restaurant a first-class citizen: tagged, filterable, colored
 * on the wheel, and visible to cuisine rotation.
 *
 * Honors Milestone 1's locked rule: NEVER invents a tag. A label only
 * resolves when a matching tag already exists (the 0009 migration seeds the
 * predefined catalog with exactly the labels placeMapping emits, so in
 * practice everything resolves — but a label with no tag simply attaches
 * nothing). Custom-category tags are never matched: a user's custom tag
 * owning a cuisine name would silently recolor provider adds.
 */

export interface MatchableTag {
  id: number;
  name: string;
  category?: string | null;
}

/** Label-normalizing synonyms → the seeded tag names (lowercase → lowercase). */
const SYNONYMS: Record<string, string> = {
  barbecue: "bbq",
  burger: "burgers",
  sandwich: "sandwiches",
  "sandwich shop": "sandwiches",
  "coffee shop": "cafe",
  coffee: "cafe",
  veggie: "vegetarian",
};

/**
 * The existing tag a cuisine label resolves to, or null. Case-insensitive,
 * synonym-aware; cuisine-category tags win over food_type on a name clash.
 */
export function matchCuisineTag<T extends MatchableTag>(
  label: string | null | undefined,
  tags: T[],
): T | null {
  if (!label) return null;
  const raw = label.trim().toLowerCase();
  if (!raw) return null;
  const wanted = SYNONYMS[raw] ?? raw;

  let foodType: T | null = null;
  for (const t of tags) {
    if (t.category !== "cuisine" && t.category !== "food_type") continue;
    if (t.name.toLowerCase() !== wanted) continue;
    if (t.category === "cuisine") return t;
    foodType ??= t;
  }
  return foodType;
}
