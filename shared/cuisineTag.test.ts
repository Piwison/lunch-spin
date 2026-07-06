import { describe, expect, it } from "vitest";
import { matchCuisineTag, type MatchableTag } from "./cuisineTag";

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
