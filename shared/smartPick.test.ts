import { describe, expect, it } from "vitest";
import {
  applyMoodBoost,
  explainPick,
  matchedMoodKeyword,
  moodBoost,
  moodKeywords,
  type SmartCandidate,
} from "./smartPick";

const c = (over: Partial<SmartCandidate> & { id: number }): SmartCandidate => ({
  name: "Place",
  tags: [],
  cuisine: null,
  daysSinceLastPick: null,
  ...over,
});

describe("moodKeywords", () => {
  it("includes chips and dedupes with free text", () => {
    expect(moodKeywords({ chips: ["Spicy", "spicy"], text: "" })).toEqual(["spicy"]);
  });

  it("extracts content words from free text and drops stopwords/short tokens", () => {
    expect(moodKeywords({ text: "I want something with noodles and a bit spicy" })).toEqual([
      "noodles",
      "spicy",
    ]);
  });

  it("merges chips then text, deduped, lowercased", () => {
    expect(moodKeywords({ chips: ["Healthy"], text: "healthy ramen" })).toEqual(["healthy", "ramen"]);
  });

  it("returns empty for blank input", () => {
    expect(moodKeywords({})).toEqual([]);
    expect(moodKeywords({ text: "   " })).toEqual([]);
  });
});

describe("matchedMoodKeyword", () => {
  const ramen = c({ id: 1, name: "Ramen House", cuisine: "Japanese", tags: ["noodles", "warm"] });

  it("matches against name, cuisine, or tags", () => {
    expect(matchedMoodKeyword(ramen, ["noodles"])).toBe("noodles");
    expect(matchedMoodKeyword(ramen, ["japanese"])).toBe("japanese");
    expect(matchedMoodKeyword(ramen, ["ramen"])).toBe("ramen");
  });

  it("returns the first matching keyword, or null", () => {
    expect(matchedMoodKeyword(ramen, ["spicy", "warm"])).toBe("warm");
    expect(matchedMoodKeyword(ramen, ["spicy"])).toBeNull();
    expect(matchedMoodKeyword(ramen, [])).toBeNull();
  });
});

describe("moodBoost / applyMoodBoost", () => {
  const cands = [
    c({ id: 1, name: "Ramen House", cuisine: "Japanese", tags: ["spicy"] }),
    c({ id: 2, name: "Green Bowl", cuisine: "Salad", tags: ["healthy"] }),
  ];

  it("boosts matches and leaves others at 1", () => {
    const b = moodBoost(cands, ["spicy"], 3);
    expect(b.get(1)).toBe(3);
    expect(b.get(2)).toBe(1);
  });

  it("no keywords means no boost (all 1)", () => {
    const b = moodBoost(cands, []);
    expect([...b.values()]).toEqual([1, 1]);
  });

  it("applyMoodBoost multiplies base weights", () => {
    const base = [
      { restaurantId: 1, weight: 2 },
      { restaurantId: 2, weight: 5 },
    ];
    const boosted = applyMoodBoost(base, new Map([[1, 3], [2, 1]]));
    expect(boosted).toEqual([
      { restaurantId: 1, weight: 6 },
      { restaurantId: 2, weight: 5 },
    ]);
  });
});

describe("explainPick", () => {
  it("prefers a mood match", () => {
    const chosen = c({ id: 1, name: "Taco Stand", tags: ["spicy"], daysSinceLastPick: 0 });
    expect(explainPick({ chosen, moodKeywords: ["spicy"], totalCandidates: 3 })).toBe(
      "Spicy — just like you asked.",
    );
  });

  it("calls out a never-picked spot", () => {
    const chosen = c({ id: 1, name: "New Spot", daysSinceLastPick: null });
    expect(explainPick({ chosen, moodKeywords: [], totalCandidates: 3 })).toMatch(/fresh face/i);
  });

  it("calls out a long-overdue spot with day count", () => {
    const chosen = c({ id: 1, name: "Ramen House", daysSinceLastPick: 9 });
    expect(explainPick({ chosen, moodKeywords: [], totalCandidates: 3 })).toBe(
      "You haven't had Ramen House in 9 days.",
    );
  });

  it("falls back to cuisine when recently-ish picked", () => {
    const chosen = c({ id: 1, name: "Pho 99", cuisine: "Vietnamese", daysSinceLastPick: 1 });
    expect(explainPick({ chosen, moodKeywords: [], totalCandidates: 3 })).toBe(
      "Feeling Vietnamese? The wheel says yes.",
    );
  });

  it("uses a generic line when nothing else applies", () => {
    const chosen = c({ id: 1, name: "Diner", cuisine: null, daysSinceLastPick: 0 });
    expect(explainPick({ chosen, moodKeywords: [], totalCandidates: 4 })).toBe(
      "Narrowed 4 options down to this one.",
    );
  });

  it("respects a custom recency threshold", () => {
    const chosen = c({ id: 1, name: "X", cuisine: "Thai", daysSinceLastPick: 3 });
    expect(explainPick({ chosen, moodKeywords: [], totalCandidates: 2, recencyDays: 2 })).toMatch(
      /haven't had X in 3 days/,
    );
  });
});
