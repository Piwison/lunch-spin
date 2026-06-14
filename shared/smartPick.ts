// "Smart Pick" — a free, LLM-free recommendation engine. It reuses the wheel's
// existing weighting signals (fairness/recency/cuisine-rotation/votes, defined
// in weight.ts + session.ts) and adds an optional mood boost, then produces a
// short, *truthful* templated reason describing a real property of the chosen
// restaurant. Pure + deterministic so it all lives in the shared TDD seam.

import type { Weighted } from "./weight";

export type SmartCandidate = {
  id: number;
  name: string;
  /** Tag names (any category). */
  tags: string[];
  /** Cuisine tag name, if any. */
  cuisine: string | null;
  /** Whole days since last picked; null = never picked. */
  daysSinceLastPick: number | null;
};

/** Stop-words dropped from free-text mood before keyword extraction. */
const MOOD_STOPWORDS = new Set([
  "the", "a", "an", "some", "something", "anything", "want", "wanna", "with",
  "for", "and", "or", "im", "feeling", "feel", "like", "food", "lunch", "eat",
  "please", "really", "very", "kinda", "bit", "today", "now", "to", "of", "in",
]);

/** Default multiplier applied to mood-matching candidates' weights. */
export const MOOD_BOOST_FACTOR = 3;

/** Recency (days) at/above which "you haven't had X in a while" is a fair claim. */
export const RECENCY_REASON_DAYS = 5;

/** Normalise mood chips + free text into a deduped lowercase keyword list. */
export function moodKeywords(input: { chips?: string[]; text?: string }): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const k = raw.trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  };
  for (const c of input.chips ?? []) push(c);
  for (const tok of (input.text ?? "").toLowerCase().split(/[^a-z]+/)) {
    if (tok.length >= 3 && !MOOD_STOPWORDS.has(tok)) push(tok);
  }
  return out;
}

/** The first mood keyword that genuinely matches this candidate, or null. */
export function matchedMoodKeyword(c: SmartCandidate, keywords: string[]): string | null {
  const haystay = [c.name, c.cuisine ?? "", ...c.tags].join(" ").toLowerCase();
  for (const k of keywords) {
    if (haystay.includes(k)) return k;
  }
  return null;
}

/** id → weight multiplier (boost for mood matches, 1 otherwise). */
export function moodBoost(
  candidates: SmartCandidate[],
  keywords: string[],
  factor = MOOD_BOOST_FACTOR,
): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of candidates) {
    m.set(c.id, keywords.length > 0 && matchedMoodKeyword(c, keywords) ? factor : 1);
  }
  return m;
}

/** Apply mood multipliers to a base weighting (pure; returns a new array). */
export function applyMoodBoost(base: Weighted[], boost: Map<number, number>): Weighted[] {
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * (boost.get(w.restaurantId) ?? 1),
  }));
}

export type ExplainContext = {
  chosen: SmartCandidate;
  moodKeywords: string[];
  /** Total eligible candidates this round (for the "narrowed it down" flavour). */
  totalCandidates: number;
  recencyDays?: number;
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * One short, truthful sentence explaining the pick. Priority: mood match →
 * never-picked → long-overdue → cuisine → generic. Every branch states a real
 * property of `chosen`, so it stays honest despite the weighted-random draw.
 */
export function explainPick(ctx: ExplainContext): string {
  const { chosen } = ctx;
  const threshold = ctx.recencyDays ?? RECENCY_REASON_DAYS;

  const kw = matchedMoodKeyword(chosen, ctx.moodKeywords);
  if (kw) return `${cap(kw)} — just like you asked.`;

  if (chosen.daysSinceLastPick == null) {
    return "A fresh face — you've never spun this one.";
  }
  if (chosen.daysSinceLastPick >= threshold) {
    const unit = chosen.daysSinceLastPick === 1 ? "day" : "days";
    return `You haven't had ${chosen.name} in ${chosen.daysSinceLastPick} ${unit}.`;
  }
  if (chosen.cuisine) {
    return `Feeling ${chosen.cuisine}? The wheel says yes.`;
  }
  if (ctx.totalCandidates > 1) {
    return `Narrowed ${ctx.totalCandidates} options down to this one.`;
  }
  return "The wheel landed on a good one.";
}
