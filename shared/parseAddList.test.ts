import { describe, expect, it } from "vitest";
import { guessCuisine, parseAddList, resolveAddList, type ExistingTag } from "./parseAddList";

describe("parseAddList", () => {
  it("splits on commas, newlines, and 'and'", () => {
    expect(parseAddList("Joe's Pizza, Ramen House and Taco Stand")).toEqual([
      "Joe's Pizza",
      "Ramen House",
      "Taco Stand",
    ]);
  });

  it("strips a leading verb/article per item", () => {
    expect(parseAddList("add the ramen place\nalso a burger joint")).toEqual([
      "ramen place",
      "burger joint",
    ]);
  });

  it("handles bullets and semicolons", () => {
    expect(parseAddList("- Pho 99\n- Green Bowl; Curry Hut")).toEqual([
      "Pho 99",
      "Green Bowl",
      "Curry Hut",
    ]);
  });

  it("trims quotes and trailing punctuation", () => {
    expect(parseAddList('"Sushi Bar".')).toEqual(["Sushi Bar"]);
  });

  it("dedupes case-insensitively, keeping first casing", () => {
    expect(parseAddList("Taco Stand, taco stand, TACO STAND")).toEqual(["Taco Stand"]);
  });

  it("keeps '&' inside a name", () => {
    expect(parseAddList("Ben & Jerry's, Mac & Cheese Co")).toEqual([
      "Ben & Jerry's",
      "Mac & Cheese Co",
    ]);
  });

  it("drops empties", () => {
    expect(parseAddList(",,\n  \n,")).toEqual([]);
  });

  it("caps the number of items", () => {
    const many = Array.from({ length: 80 }, (_, i) => `R${i}`).join(", ");
    expect(parseAddList(many).length).toBe(50);
  });
});

describe("guessCuisine", () => {
  it("maps common keywords", () => {
    expect(guessCuisine("Ramen House")).toBe("Japanese");
    expect(guessCuisine("El Taco Loco")).toBe("Mexican");
    expect(guessCuisine("Tony's Pizzeria")).toBe("Italian");
    expect(guessCuisine("Pho 99")).toBe("Vietnamese");
    expect(guessCuisine("Curry Hut")).toBe("Indian");
  });

  it("returns null when nothing matches", () => {
    expect(guessCuisine("The Corner Spot")).toBeNull();
  });
});

describe("resolveAddList", () => {
  const tags: ExistingTag[] = [
    { id: 10, name: "Japanese", category: "cuisine" },
    { id: 11, name: "Mexican", category: "cuisine" },
    { id: 99, name: "Spicy", category: "food_type" },
  ];

  it("attaches a guessed cuisine only when a matching tag exists", () => {
    const out = resolveAddList("Ramen House, El Taco Loco, Tony's Pizzeria", tags);
    expect(out).toEqual([
      { name: "Ramen House", cuisineTagId: 10, cuisineTagName: "Japanese" },
      { name: "El Taco Loco", cuisineTagId: 11, cuisineTagName: "Mexican" },
      // Italian guessed but no Italian tag on the wheel → no tag attached
      { name: "Tony's Pizzeria", cuisineTagId: null, cuisineTagName: null },
    ]);
  });

  it("never attaches when the name has no cuisine signal", () => {
    expect(resolveAddList("The Corner Spot", tags)[0]).toEqual({
      name: "The Corner Spot",
      cuisineTagId: null,
      cuisineTagName: null,
    });
  });
});
