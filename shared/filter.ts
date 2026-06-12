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
