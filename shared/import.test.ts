import { describe, expect, it } from "vitest";
import { parseRestaurantList } from "./import";

describe("parseRestaurantList", () => {
  it("splits newline-separated names and trims whitespace", () => {
    const { names } = parseRestaurantList("  Ramen House \n Sushi Bar \n\n Pho Corner ");
    expect(names).toEqual(["Ramen House", "Sushi Bar", "Pho Corner"]);
  });

  it("also splits on commas", () => {
    const { names } = parseRestaurantList("Pizza Palace, Taco Town\nCurry House");
    expect(names).toEqual(["Pizza Palace", "Taco Town", "Curry House"]);
  });

  it("de-duplicates case-insensitively, keeping first occurrence", () => {
    const { names, skipped } = parseRestaurantList("Ramen House\nramen house\nRAMEN HOUSE");
    expect(names).toEqual(["Ramen House"]);
    expect(skipped.duplicates).toBe(2);
  });

  it("treats names already on the wheel as duplicates", () => {
    const { names, skipped } = parseRestaurantList("Sushi Bar\nNew Place", ["sushi bar"]);
    expect(names).toEqual(["New Place"]);
    expect(skipped.duplicates).toBe(1);
  });

  it("skips names over the length limit", () => {
    const long = "x".repeat(200);
    const { names, skipped } = parseRestaurantList(`Okay Name\n${long}`);
    expect(names).toEqual(["Okay Name"]);
    expect(skipped.tooLong).toBe(1);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(parseRestaurantList("   \n  \n").names).toEqual([]);
  });
});
