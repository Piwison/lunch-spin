/**
 * Pure parsing for bulk restaurant import. Users paste a list (one per line,
 * or comma-separated) and we turn it into a clean, de-duplicated set of names.
 */

export const MAX_NAME_LENGTH = 128;

export interface ParsedImport {
  names: string[];
  skipped: { tooLong: number; duplicates: number };
}

/**
 * Split pasted text into restaurant names. Accepts newline- or comma-separated
 * input, trims whitespace, drops blanks, de-duplicates case-insensitively
 * (keeping first occurrence), and skips names over the column limit.
 *
 * `existing` names (already on the wheel) are treated as duplicates so importing
 * is idempotent.
 */
export function parseRestaurantList(raw: string, existing: string[] = []): ParsedImport {
  const seen = new Set(existing.map((n) => n.trim().toLowerCase()));
  const names: string[] = [];
  let tooLong = 0;
  let duplicates = 0;

  for (const token of raw.split(/[\n,]/)) {
    const name = token.trim();
    if (!name) continue;
    if (name.length > MAX_NAME_LENGTH) {
      tooLong++;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    names.push(name);
  }

  return { names, skipped: { tooLong, duplicates } };
}
