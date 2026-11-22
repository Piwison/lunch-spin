/**
 * Is a name someone typed the same shop as a place Google returned?
 *
 * The landing page lets a visitor type places before signing in ("這家炒飯").
 * First run then finds the real listing ("這家炒飯J+") nearby — and used to put
 * BOTH on the wheel: the typed one with no location, no hours and no walk time,
 * next to the real one (2026-09-24 walkthrough P1-F). This decides when they
 * are the same place, conservatively: a wrong merge loses a place the person
 * asked for, a missed one only leaves the old duplicate.
 */

// Explicit ranges rather than \p{Script=Han}: this project compiles to a target
// without the regex `u` flag. CJK Unified Ideographs (+ Extension A) and the
// compatibility block cover every shop name in practice.
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
/** Keep letters and digits of the scripts shop names use; drop the rest. */
const NOT_NAME_CHAR = /[^0-9a-z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;

/** NFKC, lower case, a spaced branch suffix ("八方雲集 內湖店") dropped, then
 *  every space and punctuation mark removed. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    // Only a suffix set off by a separator is a branch; "阿婆麵店" is the name.
    .replace(/[\s\-·‧•(（][^\s\-·‧•(（]*店[)）]?\s*$/, "")
    .replace(NOT_NAME_CHAR, "");
}

/** Long enough that containment means something: two CJK characters, or four
 *  Latin letters. */
function distinctive(norm: string): boolean {
  if (HAN.test(norm)) return Array.from(norm).filter((c) => HAN.test(c)).length >= 2;
  return (norm.match(/[a-z]/g) ?? []).length >= 4;
}

/** One name contains the other once normalised, and the shorter is distinctive. */
export function namesMatch(typed: string, listed: string): boolean {
  const a = normalizeName(typed);
  const b = normalizeName(listed);
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return distinctive(short) && long.includes(short);
}

/** The listing a typed name most likely refers to: the closest in normalised
 *  length among the ones that match, ties going to the shorter listing as
 *  written (the main shop over a branch). */
export function bestNameMatch<T extends { name: string }>(typed: string, places: readonly T[]): T | null {
  const want = normalizeName(typed).length;
  const score = (p: T) => [Math.abs(normalizeName(p.name).length - want), p.name.length] as const;
  let best: T | null = null;
  for (const p of places) {
    if (!namesMatch(typed, p.name)) continue;
    if (!best) {
      best = p;
      continue;
    }
    const [g, l] = score(p);
    const [bg, bl] = score(best);
    if (g < bg || (g === bg && l < bl)) best = p;
  }
  return best;
}
