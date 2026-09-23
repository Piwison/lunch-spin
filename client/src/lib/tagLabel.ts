import { systemTagName, type SystemTagName } from "@shared/cuisineTag";
import type { Translate } from "@/i18n";
import type { MessageKey } from "@/i18n/dict";

/**
 * The seeded tags are stored in English (`matchCuisineTag` keys provider labels
 * on those names), so a Chinese UI translates them at render time. Anything else
 * — a user's custom tag, or a label that was never seeded — is the user's own
 * words and shows as typed.
 *
 * A `Record` over `SystemTagName`, so a tag added to the seed list without a
 * translation here fails `pnpm check`; `shared/cuisineTag.test.ts` pins the list
 * to the migration itself.
 */
const KEYS: Record<SystemTagName, MessageKey> = {
  Japanese: "places.tagName.japanese",
  Chinese: "places.tagName.chinese",
  Korean: "places.tagName.korean",
  Thai: "places.tagName.thai",
  Vietnamese: "places.tagName.vietnamese",
  Indian: "places.tagName.indian",
  Italian: "places.tagName.italian",
  Mexican: "places.tagName.mexican",
  American: "places.tagName.american",
  French: "places.tagName.french",
  Mediterranean: "places.tagName.mediterranean",
  Greek: "places.tagName.greek",
  Spanish: "places.tagName.spanish",
  Turkish: "places.tagName.turkish",
  "Middle Eastern": "places.tagName.middleEastern",
  Pizza: "places.tagName.pizza",
  Burgers: "places.tagName.burgers",
  BBQ: "places.tagName.bbq",
  Seafood: "places.tagName.seafood",
  Steakhouse: "places.tagName.steakhouse",
  Sandwiches: "places.tagName.sandwiches",
  "Fast Food": "places.tagName.fastFood",
  Breakfast: "places.tagName.breakfast",
  Brunch: "places.tagName.brunch",
  Vegetarian: "places.tagName.vegetarian",
  Vegan: "places.tagName.vegan",
  Noodles: "places.tagName.noodles",
  Salad: "places.tagName.salad",
  Dessert: "places.tagName.dessert",
  Cafe: "places.tagName.cafe",
  Bakery: "places.tagName.bakery",
};

/**
 * A wheel's walking-distance origin. "Office" is a STORED default — the column's
 * default, the server's fallback, and what settings saves for a blank label — so
 * it is seed data like the tags above, shown as 公司 in Chinese and left alone
 * when someone typed their own label.
 */
export const DEFAULT_ORIGIN_LABEL = "Office";

export function originLabelText(label: string | null | undefined, t: Translate): string {
  const typed = label?.trim();
  return !typed || typed === DEFAULT_ORIGIN_LABEL ? t("common.office") : typed;
}

export function tagLabel(name: string, t: Translate, category?: string | null): string {
  const system = systemTagName(name, category);
  return system ? t(KEYS[system]) : name;
}
