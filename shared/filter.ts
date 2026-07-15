/**
 * Pure restaurant filtering for the wheel: drop auto-excluded restaurants, then
 * apply AND-logic tag intersection. Shared by WheelApp and its tests.
 */

export interface TaggedRestaurant {
  isExcluded: boolean;
  tags: { id: number }[];
}

export function filterRestaurantsByTags<T extends TaggedRestaurant>(
  restaurants: T[],
  selectedTagIds: number[],
): T[] {
  let filtered = restaurants.filter((r) => !r.isExcluded);
  if (selectedTagIds.length > 0) {
    filtered = filtered.filter((r) =>
      selectedTagIds.every((tagId) => r.tags.some((t) => t.id === tagId)),
    );
  }
  return filtered;
}

export interface WalkTimedRestaurant {
  walkSeconds: number | null;
}

/**
 * `maxMinutes: null` means the distance filter is off (opt-in, matches the tag
 * filter's "empty selection = show everything" default) — everything passes
 * unchanged. Once set, a restaurant with no computed walk time can't be
 * verified to qualify, so it's excluded rather than given the benefit of the
 * doubt (same rule an unmet tag filter already applies).
 */
export function filterRestaurantsByDistance<T extends WalkTimedRestaurant>(
  restaurants: T[],
  maxMinutes: number | null,
): T[] {
  if (maxMinutes == null) return restaurants;
  const maxSeconds = maxMinutes * 60;
  return restaurants.filter((r) => r.walkSeconds != null && r.walkSeconds <= maxSeconds);
}
