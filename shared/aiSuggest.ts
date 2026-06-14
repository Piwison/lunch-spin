// AI "decide for me" suggestion — pure logic (prompt building + response
// validation). Kept free of server/LLM-SDK imports so it lives in the shared
// TDD seam; the server passes the messages straight to invokeLLM and feeds the
// raw model output back through parseSuggestion.

/** Minimal chat message shape (structurally compatible with the LLM SDK). */
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** One eligible restaurant, as the model sees it. */
export type SuggestCandidate = {
  id: number;
  name: string;
  tags: string[];
  cuisine: string | null;
  notes: string | null;
  /** Whole days since this spot was last picked; null = never picked. */
  daysSinceLastPick: number | null;
};

export type SuggestContext = {
  /** Recent restaurant names, most-recent first — to bias toward variety. */
  recentPicks?: string[];
  /** Optional free-text vibe from the diner ("something light", "spicy"). */
  mood?: string;
  /** Optional human-readable local time, e.g. "12:30 PM". */
  timeOfDay?: string;
};

export type Suggestion = { restaurantId: number; reason: string };

/** JSON-schema for structured LLM output (passed as invokeLLM outputSchema). */
export const SUGGEST_SCHEMA = {
  name: "lunch_suggestion",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["restaurantId", "reason"],
    properties: {
      restaurantId: {
        type: "integer",
        description: "id of the chosen restaurant; MUST be one of the provided candidate ids",
      },
      reason: {
        type: "string",
        description: "one short, friendly sentence explaining the pick",
      },
    },
  },
} as const;

const MAX_REASON_LEN = 160;
const FALLBACK_REASON = "Picked this one for you.";

const SYSTEM_PROMPT = [
  "You are a decisive lunch assistant for a restaurant-picker wheel.",
  "Choose EXACTLY ONE restaurant from the candidate list the user provides.",
  "Pick by its numeric id — only ids that appear in the list are allowed.",
  "Favour variety over the recent picks, honour the diner's mood when given,",
  "and use the tags/cuisine/notes to justify the choice.",
  "Respond ONLY with JSON of the form {\"restaurantId\": <id>, \"reason\": <one friendly sentence>}.",
].join(" ");

/**
 * Build the system+user messages for a suggestion request. Pure and
 * deterministic so it can be asserted in tests.
 */
export function buildSuggestPrompt(
  candidates: SuggestCandidate[],
  context: SuggestContext = {},
): ChatMessage[] {
  const lines = candidates.map((c) => {
    const parts: string[] = [`#${c.id} ${c.name}`];
    if (c.cuisine) parts.push(`cuisine: ${c.cuisine}`);
    if (c.tags.length) parts.push(`tags: ${c.tags.join(", ")}`);
    if (c.daysSinceLastPick == null) parts.push("never picked");
    else parts.push(`last picked ${c.daysSinceLastPick}d ago`);
    if (c.notes) parts.push(`notes: ${c.notes}`);
    return parts.join(" | ");
  });

  const userParts: string[] = [`Candidates (choose one by id):\n${lines.join("\n")}`];
  if (context.recentPicks && context.recentPicks.length) {
    userParts.push(`Recent picks (avoid repeating): ${context.recentPicks.join(", ")}`);
  }
  if (context.timeOfDay) userParts.push(`Local time: ${context.timeOfDay}`);
  if (context.mood && context.mood.trim()) userParts.push(`Diner mood: ${context.mood.trim()}`);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n\n") },
  ];
}

/** Strip a ```json … ``` (or plain ```) fence if the model wrapped its output. */
function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : text).trim();
}

function toObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(stripFence(raw));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validate a raw model response into a Suggestion, or null if unusable.
 * Rejects any restaurantId not in `eligibleIds` (anti-hallucination guard).
 */
export function parseSuggestion(
  raw: unknown,
  eligibleIds: Iterable<number>,
): Suggestion | null {
  const obj = toObject(raw);
  if (!obj) return null;

  const id = Number(obj.restaurantId);
  if (!Number.isInteger(id)) return null;

  const eligible = eligibleIds instanceof Set ? eligibleIds : new Set(eligibleIds);
  if (!eligible.has(id)) return null;

  let reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  if (!reason) reason = FALLBACK_REASON;
  if (reason.length > MAX_REASON_LEN) reason = `${reason.slice(0, MAX_REASON_LEN - 1).trimEnd()}…`;

  return { restaurantId: id, reason };
}
