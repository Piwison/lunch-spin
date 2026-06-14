// "Smart add" — free, LLM-free parsing of a loose restaurant list into clean
// names, plus a best-effort cuisine guess mapped ONLY to tags that already
// exist on the wheel (never invents tags). Pure + deterministic.

const MAX_NAME_LENGTH = 128;
const MAX_ITEMS = 50;

/** Leading command verbs ("add the ramen place" → "ramen place"). */
const LEADING_VERB = /^(?:add|include|put|also|maybe)\s+/i;
/** An article stripped only when it directly followed a command verb. */
const LEADING_ARTICLE = /^(?:the|a|an|some)\s+/i;

/**
 * Split a freeform blob into candidate names. Handles newlines, commas,
 * semicolons, bullets, and " and " / "&" separators; strips leading command
 * verbs (and a following article), surrounding quotes, and trailing
 * punctuation; dedupes case-insensitively. A bare leading article is kept so
 * real names like "The Corner Spot" survive.
 */
export function parseAddList(text: string): string[] {
  const rawTokens = text.split(/[\n,;]|\s+&\s+|\s+\band\b\s+/i);

  const seen = new Set<string>();
  const names: string[] = [];
  for (let token of rawTokens) {
    token = token.trim().replace(/^[•*\-]\s+/, ""); // leading bullet
    token = token.replace(/^["'`]+|["'`.!]+$/g, "").trim();
    // Strip a leading command verb, and only then a following article.
    const verb = token.match(LEADING_VERB);
    if (verb) token = token.slice(verb[0].length).replace(LEADING_ARTICLE, "").trim();
    if (!token) continue;
    if (token.length > MAX_NAME_LENGTH) token = token.slice(0, MAX_NAME_LENGTH).trim();
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(token);
    if (names.length >= MAX_ITEMS) break;
  }
  return names;
}

/** Keyword → cuisine label. Order matters: first match wins for ambiguous words. */
const CUISINE_KEYWORDS: Array<[string, string[]]> = [
  ["Japanese", ["ramen", "sushi", "izakaya", "udon", "tempura", "japanese", "sashimi", "donburi", "teriyaki"]],
  ["Mexican", ["taco", "burrito", "taqueria", "mexican", "quesadilla", "nachos", "cantina"]],
  ["Italian", ["pizza", "pizzeria", "pasta", "italian", "trattoria", "risotto", "osteria"]],
  ["Chinese", ["dim sum", "dumpling", "chinese", "szechuan", "sichuan", "wok", "noodle house"]],
  ["Thai", ["thai", "pad thai", "tom yum"]],
  ["Indian", ["curry", "indian", "tandoor", "masala", "biryani", "naan"]],
  ["Vietnamese", ["pho", "banh mi", "vietnamese"]],
  ["Korean", ["korean", "bibimbap", "kimchi", "gochujang", "bulgogi"]],
  ["American", ["burger", "diner", "grill", "american", "bbq", "steakhouse", "deli", "wings"]],
  ["Mediterranean", ["kebab", "shawarma", "falafel", "gyro", "mediterranean", "greek", "hummus"]],
];

/** Best-effort cuisine label from a name, or null if nothing matches. */
export function guessCuisine(name: string): string | null {
  const n = name.toLowerCase();
  for (const [label, keywords] of CUISINE_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return label;
  }
  return null;
}

export type ExistingTag = { id: number; name: string; category?: string };

export type ResolvedAdd = {
  name: string;
  /** Existing cuisine tag id this name maps to, or null. */
  cuisineTagId: number | null;
  cuisineTagName: string | null;
};

/**
 * Parse + resolve a blob against the wheel's existing tags. A guessed cuisine is
 * only attached when a matching tag already exists (case-insensitive). Never
 * creates tags.
 */
export function resolveAddList(text: string, existingTags: ExistingTag[]): ResolvedAdd[] {
  const cuisineTags = existingTags.filter((t) => t.category == null || t.category === "cuisine");
  const byName = new Map(cuisineTags.map((t) => [t.name.toLowerCase(), t]));
  return parseAddList(text).map((name) => {
    const guess = guessCuisine(name);
    const tag = guess ? byName.get(guess.toLowerCase()) ?? null : null;
    return {
      name,
      cuisineTagId: tag?.id ?? null,
      cuisineTagName: tag?.name ?? null,
    };
  });
}
