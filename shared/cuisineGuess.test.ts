import { describe, expect, it } from "vitest";
import { guessCuisine } from "./cuisineGuess";
import { SYSTEM_TAG_NAMES } from "./cuisineTag";

describe("guessCuisine", () => {
  it.each([
    ["首爾韓式小館", "Korean"],
    ["Seoul Korean Kitchen", "Korean"],
    ["韓國烤肉", "Korean"],
    ["一蘭拉麵", "Japanese"],
    ["壽司郎 內湖店", "Japanese"],
    ["Sushiro Neihu", "Japanese"],
    ["Ichiran Ramen", "Japanese"],
    ["日式豬排丼", "Japanese"],
    ["暹羅泰式料理", "Thai"],
    ["Siam Thai Kitchen", "Thai"],
    ["西貢越南河粉", "Vietnamese"],
    ["Saigon Pho", "Vietnamese"],
    ["老張牛肉麵", "Noodles"],
    ["Lao Zhang Beef Noodles", "Noodles"],
    ["Tai Ji Hand-pulled Noodles", "Noodles"],
    ["摩斯漢堡 內湖瑞光店", "Burgers"],
    ["MOS Burger Ruiguang", "Burgers"],
    ["路易莎咖啡", "Cafe"],
    ["Corner Cafe", "Cafe"],
    ["Blue Bottle Coffee", "Cafe"],
    ["義大利麵工坊", "Italian"],
    ["Pasta Workshop", "Italian"],
    ["必勝客披薩", "Pizza"],
    ["Pizza Hut", "Pizza"],
    ["吳寶春麵包店", "Bakery"],
    ["Paul Bakery", "Bakery"],
    ["瑞麟美而美早餐", "Breakfast"],
    ["Sunny Brunch", "Brunch"],
    ["好日早午餐", "Brunch"],
    ["王品牛排", "Steakhouse"],
    ["海鮮熱炒", "Seafood"],
    ["印度咖哩屋", "Indian"],
    ["墨西哥捲餅", "Mexican"],
    ["蔬食便當", "Vegetarian"],
    ["沙拉專賣", "Salad"],
    ["甜點工作室", "Dessert"],
    ["三明治小舖", "Sandwiches"],
  ])("%s → %s", (name, cuisine) => {
    expect(guessCuisine(name)).toBe(cuisine);
  });

  it("does not read a hot-pot place as Korean", () => {
    expect(guessCuisine("火鍋106")).toBeNull();
    expect(guessCuisine("Hot Pot 106")).toBeNull();
  });

  it("does not read the 泰 in 鼎泰豐 as Thai — 泰 alone is a common name character", () => {
    expect(guessCuisine("鼎泰豐")).not.toBe("Thai");
  });

  it("reads bread as a bakery, not noodles: 麵包 contains 麵", () => {
    expect(guessCuisine("麵包坊")).toBe("Bakery");
  });

  it("reads ramen as Japanese, not generic noodles", () => {
    expect(guessCuisine("拉麵")).toBe("Japanese");
    expect(guessCuisine("Ramen Noodle Bar")).toBe("Japanese");
  });

  it("matches Latin keywords as words, not inside other words", () => {
    expect(guessCuisine("Phoenix Diner")).toBeNull();
    expect(guessCuisine("Thailand Street")).toBeNull();
  });

  it("returns null when the name carries no keyword", () => {
    expect(guessCuisine("鵝肉担")).toBeNull();
    expect(guessCuisine("Goose Meat Dan")).toBeNull();
    expect(guessCuisine("莫宰羊")).toBeNull();
    expect(guessCuisine("")).toBeNull();
  });

  it("only ever answers with a seeded tag name", () => {
    const names = ["首爾韓式小館", "拉麵", "泰式", "河粉", "麵", "漢堡", "咖啡", "披薩", "麵包", "早午餐"];
    for (const n of names) expect(SYSTEM_TAG_NAMES).toContain(guessCuisine(n));
  });
});
