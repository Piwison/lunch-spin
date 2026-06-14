import { describe, expect, it } from "vitest";
import {
  buildSuggestPrompt,
  parseSuggestion,
  SUGGEST_SCHEMA,
  type SuggestCandidate,
} from "./aiSuggest";

const candidates: SuggestCandidate[] = [
  { id: 1, name: "Ramen House", tags: ["noodles", "warm"], cuisine: "Japanese", notes: "counter seats", daysSinceLastPick: 9 },
  { id: 2, name: "Taco Stand", tags: ["spicy"], cuisine: "Mexican", notes: null, daysSinceLastPick: null },
  { id: 3, name: "Green Bowl", tags: ["healthy", "vegan"], cuisine: null, notes: null, daysSinceLastPick: 2 },
];

describe("buildSuggestPrompt", () => {
  it("returns a system then user message", () => {
    const msgs = buildSuggestPrompt(candidates);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("instructs the model to return JSON and pick one id", () => {
    const [system] = buildSuggestPrompt(candidates);
    expect(system.content).toMatch(/json/i);
    expect(system.content).toMatch(/exactly one/i);
    expect(system.content).toMatch(/restaurantId/);
  });

  it("lists every candidate by id and name", () => {
    const user = buildSuggestPrompt(candidates)[1].content;
    expect(user).toContain("#1 Ramen House");
    expect(user).toContain("#2 Taco Stand");
    expect(user).toContain("#3 Green Bowl");
  });

  it("encodes never-picked vs recency and tags/cuisine/notes", () => {
    const user = buildSuggestPrompt(candidates)[1].content;
    expect(user).toContain("never picked"); // Taco Stand
    expect(user).toContain("last picked 9d ago"); // Ramen House
    expect(user).toContain("cuisine: Japanese");
    expect(user).toContain("tags: healthy, vegan");
    expect(user).toContain("notes: counter seats");
  });

  it("includes recent picks, time, and mood when provided", () => {
    const user = buildSuggestPrompt(candidates, {
      recentPicks: ["Pizza Place", "Ramen House"],
      timeOfDay: "12:30 PM",
      mood: "  something light  ",
    })[1].content;
    expect(user).toMatch(/Recent picks.*Pizza Place, Ramen House/);
    expect(user).toContain("Local time: 12:30 PM");
    expect(user).toContain("Diner mood: something light"); // trimmed
  });

  it("omits optional context lines when absent or blank", () => {
    const user = buildSuggestPrompt(candidates, { mood: "   " })[1].content;
    expect(user).not.toMatch(/Recent picks/);
    expect(user).not.toMatch(/Local time/);
    expect(user).not.toMatch(/Diner mood/);
  });
});

describe("parseSuggestion", () => {
  const eligible = [1, 2, 3];

  it("accepts a valid object whose id is eligible", () => {
    expect(parseSuggestion({ restaurantId: 2, reason: "Spicy and quick." }, eligible)).toEqual({
      restaurantId: 2,
      reason: "Spicy and quick.",
    });
  });

  it("parses a JSON string", () => {
    const raw = JSON.stringify({ restaurantId: 1, reason: "You're due for ramen." });
    expect(parseSuggestion(raw, eligible)).toEqual({ restaurantId: 1, reason: "You're due for ramen." });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const raw = "```json\n{ \"restaurantId\": 3, \"reason\": \"Light and healthy.\" }\n```";
    expect(parseSuggestion(raw, eligible)).toEqual({ restaurantId: 3, reason: "Light and healthy." });
  });

  it("coerces a numeric-string id", () => {
    expect(parseSuggestion({ restaurantId: "2", reason: "ok" }, eligible)?.restaurantId).toBe(2);
  });

  it("rejects an id that is not eligible (anti-hallucination)", () => {
    expect(parseSuggestion({ restaurantId: 99, reason: "made up" }, eligible)).toBeNull();
  });

  it("rejects malformed JSON, non-objects, and missing ids", () => {
    expect(parseSuggestion("not json", eligible)).toBeNull();
    expect(parseSuggestion("[1,2,3]", eligible)).toBeNull();
    expect(parseSuggestion(null, eligible)).toBeNull();
    expect(parseSuggestion({ reason: "no id" }, eligible)).toBeNull();
    expect(parseSuggestion({ restaurantId: 1.5, reason: "x" }, eligible)).toBeNull();
  });

  it("falls back to a generic reason when reason is missing/blank", () => {
    expect(parseSuggestion({ restaurantId: 1, reason: "   " }, eligible)).toEqual({
      restaurantId: 1,
      reason: "Picked this one for you.",
    });
    expect(parseSuggestion({ restaurantId: 1 }, eligible)?.reason).toBeTruthy();
  });

  it("truncates an over-long reason", () => {
    const long = "x".repeat(500);
    const out = parseSuggestion({ restaurantId: 1, reason: long }, eligible);
    expect(out!.reason.length).toBeLessThanOrEqual(160);
    expect(out!.reason.endsWith("…")).toBe(true);
  });

  it("works with a Set of eligible ids", () => {
    expect(parseSuggestion({ restaurantId: 2, reason: "y" }, new Set([2]))?.restaurantId).toBe(2);
    expect(parseSuggestion({ restaurantId: 1, reason: "y" }, new Set([2]))).toBeNull();
  });
});

describe("SUGGEST_SCHEMA", () => {
  it("is a strict object schema requiring restaurantId and reason", () => {
    expect(SUGGEST_SCHEMA.strict).toBe(true);
    expect(SUGGEST_SCHEMA.schema.required).toEqual(["restaurantId", "reason"]);
    expect(SUGGEST_SCHEMA.schema.additionalProperties).toBe(false);
  });
});
