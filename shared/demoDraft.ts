/**
 * The landing-page demo wheel, carried across Google sign-in.
 *
 * 2026-09-23 user test: a visitor typed 公司樓下雞肉飯 into the demo, spun it,
 * pressed "把這個輪盤存起來" — and landed in first run with nothing they had
 * typed. The save button was a plain redirect to Google. Now the landing page
 * writes a draft before redirecting and first run offers those places,
 * pre-ticked, alongside the nearby ones.
 *
 * Only what the visitor TYPED is carried. The demo's seed (巷口牛肉麵, 樓下便當…)
 * is placeholder copy, and saving it as someone's real wheel would repeat the
 * "Pizza Place" mistake OnboardingFlow was written to end.
 *
 * The same name rules stop duplicates in the demo itself (a repeated name gave
 * a place an extra wedge and silently multiplied its odds).
 */

import { MAX_SEGMENTS } from "./nearby";

/** localStorage key. Versioned so a shape change can't be misread. */
export const DEMO_DRAFT_KEY = "lunchwheel.demoDraft.v1";

/** A draft this old is somebody else's afternoon, not this sign-in. */
export const DEMO_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** Longest name the demo accepts — a chip on a phone, not a paragraph. */
export const MAX_DEMO_NAME = 12;

/**
 * Comparison key for "is this the same place?": Unicode-compatible (a
 * full-width Ｍ from a Chinese IME equals M), case-insensitive, and blind to
 * whitespace — 巷口 牛肉麵 and 巷口牛肉麵 are one shop.
 */
export function normalizePlaceName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function isDuplicateName(name: string, existing: readonly string[]): boolean {
  const key = normalizePlaceName(name);
  return key.length > 0 && existing.some((e) => normalizePlaceName(e) === key);
}

/** Trimmed, non-empty, de-duplicated, in first-seen order. */
function cleanNames(names: readonly string[], taken: readonly string[] = []): string[] {
  const seen = new Set(taken.map(normalizePlaceName));
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = normalizePlaceName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** What the visitor typed into the demo, without the seeded examples. */
export function userAddedNames(current: readonly string[], seed: readonly string[]): string[] {
  return cleanNames(current, seed);
}

export function serializeDemoDraft(names: readonly string[], now: number): string {
  return JSON.stringify({ names, savedAt: now });
}

/**
 * Read a draft back. Everything localStorage returns is untrusted — another
 * tab, an older version, a hand edit — so the result is re-cleaned, clipped to
 * a chip's length and to what a wheel can hold, and empty when expired.
 */
export function parseDemoDraft(raw: string | null, now: number): string[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== "object" || data === null) return [];
  const { names, savedAt } = data as { names?: unknown; savedAt?: unknown };
  if (!Array.isArray(names) || typeof savedAt !== "number") return [];
  if (now - savedAt > DEMO_DRAFT_TTL_MS) return [];
  const strings = names.filter((n): n is string => typeof n === "string");
  return cleanNames(strings.map((n) => n.trim().slice(0, MAX_DEMO_NAME))).slice(0, MAX_SEGMENTS);
}

/**
 * The typed names to add to a wheel being built from nearby places: minus any
 * the nearby list already put there, and minus repeats among themselves.
 */
export function mergeExtraNames(extra: readonly string[], taken: readonly string[]): string[] {
  return cleanNames(extra, taken);
}
