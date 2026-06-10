import { describe, expect, it } from "vitest";
import { filterRestaurantsByTags } from "./filter";

type R = { id: number; name: string; isExcluded: boolean; tags: { id: number; name: string }[] };

const sample: R[] = [
  { id: 1, name: "Ramen House", isExcluded: false, tags: [{ id: 1, name: "Japanese" }, { id: 9, name: "Noodle" }] },
  { id: 2, name: "Sushi Bar", isExcluded: false, tags: [{ id: 1, name: "Japanese" }] },
  { id: 3, name: "Pho Corner", isExcluded: false, tags: [{ id: 4, name: "Vietnamese" }, { id: 9, name: "Noodle" }] },
  { id: 4, name: "Pizza Palace", isExcluded: false, tags: [{ id: 7, name: "Italian" }, { id: 16, name: "Pizza" }] },
  { id: 5, name: "Excluded Place", isExcluded: true, tags: [{ id: 1, name: "Japanese" }] },
];

describe("filterRestaurantsByTags", () => {
  it("returns all non-excluded restaurants when no tags selected", () => {
    const result = filterRestaurantsByTags(sample, []);
    expect(result).toHaveLength(4);
    expect(result.every((r) => !r.isExcluded)).toBe(true);
  });

  it("filters by a single tag", () => {
    const result = filterRestaurantsByTags(sample, [1]);
    expect(result.map((r) => r.name)).toEqual(["Ramen House", "Sushi Bar"]);
  });

  it("enforces AND logic across multiple tags", () => {
    const result = filterRestaurantsByTags(sample, [1, 9]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Ramen House");
  });

  it("returns empty when no restaurant matches all tags", () => {
    expect(filterRestaurantsByTags(sample, [1, 16])).toHaveLength(0);
  });

  it("always drops excluded restaurants regardless of tags", () => {
    const result = filterRestaurantsByTags(sample, [1]);
    expect(result.find((r) => r.name === "Excluded Place")).toBeUndefined();
  });
});
