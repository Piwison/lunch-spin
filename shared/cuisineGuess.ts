/**
 * A cuisine guessed from a place's NAME. Google's legacy Places types say
 * "restaurant" for almost every lunch spot in Taipei, so a place added from
 * search usually arrived with no cuisine at all — and "Not today: Korean" then
 * had nothing to act on. The name nearly always says it instead: 首爾韓式小館,
 * 西貢越南河粉, Sushiro.
 *
 * A guess is only a SUGGESTED tag, written when a place is added and editable
 * like any other tag. It never overrides a cuisine Google did report.
 *
 * Rules are ordered, first match wins, most specific first: 麵包 (bread) before
 * 麵 (noodles), 拉麵 (ramen) before 麵, 早午餐 before 早餐. Han keywords match
 * anywhere in the name; Latin keywords match whole words only, so "Phoenix" is
 * not pho and "Thailand" is not Thai. Bare 泰 is deliberately absent — it is a
 * common name character (鼎泰豐 is dumplings) — so Thai needs 泰式 or 泰國.
 */
import type { SystemTagName } from "./cuisineTag";

interface Rule {
  cuisine: SystemTagName;
  han?: string[];
  latin?: string[];
}

const RULES: Rule[] = [
  { cuisine: "Brunch", han: ["早午餐"], latin: ["brunch"] },
  { cuisine: "Bakery", han: ["麵包", "烘焙"], latin: ["bakery", "boulangerie"] },
  { cuisine: "Korean", han: ["韓式", "韓國", "韓"], latin: ["korean", "seoul", "bibimbap"] },
  {
    cuisine: "Japanese",
    han: ["拉麵", "壽司", "日式", "日本", "丼", "居酒屋", "烏龍麵", "定食"],
    latin: ["japanese", "sushi", "sushiro", "ramen", "udon", "izakaya", "donburi", "yoshinoya"],
  },
  { cuisine: "Thai", han: ["泰式", "泰國"], latin: ["thai"] },
  { cuisine: "Vietnamese", han: ["越南", "河粉"], latin: ["vietnamese", "pho", "banh"] },
  { cuisine: "Italian", han: ["義大利", "義式"], latin: ["italian", "pasta", "trattoria"] },
  { cuisine: "Pizza", han: ["披薩", "比薩"], latin: ["pizza", "pizzeria"] },
  { cuisine: "Burgers", han: ["漢堡"], latin: ["burger", "burgers"] },
  { cuisine: "Indian", han: ["印度"], latin: ["indian"] },
  { cuisine: "Mexican", han: ["墨西哥"], latin: ["mexican", "taco", "tacos", "burrito"] },
  { cuisine: "Steakhouse", han: ["牛排"], latin: ["steak", "steakhouse"] },
  { cuisine: "Seafood", han: ["海鮮"], latin: ["seafood"] },
  { cuisine: "Vegetarian", han: ["素食", "蔬食"], latin: ["vegetarian"] },
  { cuisine: "Vegan", latin: ["vegan"] },
  { cuisine: "Salad", han: ["沙拉"], latin: ["salad", "salads"] },
  { cuisine: "Sandwiches", han: ["三明治"], latin: ["sandwich", "sandwiches", "subway"] },
  { cuisine: "Dessert", han: ["甜點", "甜品"], latin: ["dessert", "desserts"] },
  { cuisine: "Cafe", han: ["咖啡"], latin: ["cafe", "café", "coffee"] },
  { cuisine: "Breakfast", han: ["早餐"], latin: ["breakfast"] },
  { cuisine: "Noodles", han: ["麵"], latin: ["noodle", "noodles"] },
];

/** The seeded cuisine tag a place's name suggests, or null. */
export function guessCuisine(name: string): SystemTagName | null {
  const text = name.normalize("NFKC");
  // Latin words only; everything else is a separator.
  const words = new Set(text.toLowerCase().split(/[^a-zé]+/).filter(Boolean));
  for (const rule of RULES) {
    if (rule.han?.some((k) => text.includes(k))) return rule.cuisine;
    if (rule.latin?.some((k) => words.has(k))) return rule.cuisine;
  }
  return null;
}
