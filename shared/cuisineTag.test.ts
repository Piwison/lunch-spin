import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchCuisineTag, SYSTEM_TAG_NAMES, systemTagName, type MatchableTag } from "./cuisineTag";
import { PROVIDER_CUISINE_LABELS } from "./placeMapping";

const TAGS: MatchableTag[] = [
  { id: 1, name: "Japanese", category: "cuisine" },
  { id: 2, name: "Mexican", category: "cuisine" },
  { id: 3, name: "Middle Eastern", category: "cuisine" },
  { id: 4, name: "Pizza", category: "food_type" },
  { id: 5, name: "BBQ", category: "food_type" },
  { id: 6, name: "Burgers", category: "food_type" },
  { id: 7, name: "Sandwiches", category: "food_type" },
  { id: 8, name: "Cafe", category: "food_type" },
  { id: 9, name: "Ramen Club", category: "custom" },
];

describe("matchCuisineTag", () => {
  it("matches a cuisine label case-insensitively", () => {
    expect(matchCuisineTag("Japanese", TAGS)?.id).toBe(1);
    expect(matchCuisineTag("mexican", TAGS)?.id).toBe(2);
    expect(matchCuisineTag("MIDDLE EASTERN", TAGS)?.id).toBe(3);
  });

  it("matches food_type labels too (provider types like Pizza/BBQ)", () => {
    expect(matchCuisineTag("Pizza", TAGS)?.id).toBe(4);
    expect(matchCuisineTag("BBQ", TAGS)?.id).toBe(5);
  });

  it("resolves common synonyms onto the seeded names", () => {
    expect(matchCuisineTag("Barbecue", TAGS)?.id).toBe(5);
    expect(matchCuisineTag("burger", TAGS)?.id).toBe(6);
    expect(matchCuisineTag("Sandwich Shop", TAGS)?.id).toBe(7);
    expect(matchCuisineTag("Coffee Shop", TAGS)?.id).toBe(8);
  });

  it("never matches custom-category tags, even on exact name", () => {
    expect(matchCuisineTag("Ramen Club", TAGS)).toBeNull();
  });

  it("returns null for unknown or empty labels", () => {
    expect(matchCuisineTag("Klingon", TAGS)).toBeNull();
    expect(matchCuisineTag("", TAGS)).toBeNull();
    expect(matchCuisineTag(null, TAGS)).toBeNull();
    expect(matchCuisineTag(undefined, TAGS)).toBeNull();
  });

  it("prefers a cuisine-category tag when both categories carry the name", () => {
    const dup: MatchableTag[] = [
      { id: 10, name: "BBQ", category: "food_type" },
      { id: 11, name: "BBQ", category: "cuisine" },
    ];
    expect(matchCuisineTag("BBQ", dup)?.id).toBe(11);
  });
});

describe("SYSTEM_TAG_NAMES", () => {
  // The display translation (client/src/lib/tagLabel.ts) is keyed on this list,
  // so it must be exactly what the migration put in the database.
  it("is exactly the set of tags the 0009 migration seeds", () => {
    const sql = readFileSync(new URL("../drizzle/0009_seed_predefined_tags.sql", import.meta.url), "utf8");
    const seeded = [...sql.matchAll(/SELECT '([^']+)', '(?:cuisine|food_type)'/g)].map((m) => m[1]);
    expect(seeded.length).toBeGreaterThan(0);
    expect([...SYSTEM_TAG_NAMES].sort()).toEqual([...seeded].sort());
  });

  it("covers every cuisine label the provider mapping can emit", () => {
    for (const label of PROVIDER_CUISINE_LABELS) {
      expect(SYSTEM_TAG_NAMES).toContain(label);
    }
  });
});

describe("systemTagName", () => {
  it("recognises a seeded tag by its stored English name", () => {
    expect(systemTagName("Japanese", "cuisine")).toBe("Japanese");
    expect(systemTagName("Middle Eastern")).toBe("Middle Eastern");
  });

  it("leaves a user's own tag alone, even when it reuses a seeded name", () => {
    expect(systemTagName("Japanese", "custom")).toBeNull();
    expect(systemTagName("辣", "custom")).toBeNull();
  });

  it("does not guess at names that were never seeded", () => {
    expect(systemTagName("Taiwanese", "cuisine")).toBeNull();
    expect(systemTagName("japanese", "cuisine")).toBeNull();
  });
});
