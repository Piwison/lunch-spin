import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parseRestaurantList } from "./import";
import { STARTER_RESTAURANTS } from "./starter";

describe("STARTER_RESTAURANTS", () => {
  it("has unique, trimmed names within the import length limit", () => {
    expect(STARTER_RESTAURANTS.length).toBeGreaterThan(0);
    const lower = STARTER_RESTAURANTS.map((n) => n.toLowerCase());
    expect(new Set(lower).size).toBe(STARTER_RESTAURANTS.length);
    for (const name of STARTER_RESTAURANTS) {
      expect(name.trim()).toBe(name);
      expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    }
  });

  it("parses cleanly via parseRestaurantList with nothing skipped", () => {
    const { names, skipped } = parseRestaurantList(STARTER_RESTAURANTS.join("\n"));
    expect(names).toEqual([...STARTER_RESTAURANTS]);
    expect(skipped).toEqual({ tooLong: 0, duplicates: 0 });
  });
});
