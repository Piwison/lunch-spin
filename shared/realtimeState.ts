// Pure transforms backing the polling-based realtime layer: rebuild the
// SessionState from round_marks rows, and filter presence heartbeats by TTL.

import type { SessionState } from "./session";

export type MarkKind = "veto" | "vote" | "dietary";
export type RoundMarkRow = { kind: MarkKind; refId: number; userId: number };

function push(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Group round_marks rows into the shared SessionState shape. For veto/vote the
 * key is restaurantId (refId); for dietary the key is userId and refId is the
 * avoided tagId.
 */
export function buildSessionState(rows: RoundMarkRow[]): SessionState {
  const vetoes = new Map<number, number[]>();
  const votes = new Map<number, number[]>();
  const dietary = new Map<number, number[]>();
  for (const r of rows) {
    if (r.kind === "veto") push(vetoes, r.refId, r.userId);
    else if (r.kind === "vote") push(votes, r.refId, r.userId);
    else push(dietary, r.userId, r.refId);
  }
  return {
    vetoes: Array.from(vetoes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    votes: Array.from(votes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    dietary: Array.from(dietary, ([userId, tagIds]) => ({ userId, tagIds })),
  };
}

export type PresenceRow = { userId: number; name: string | null; lastSeen: Date | string | number };
export type PresenceUser = { userId: number; name: string | null };

/** Members whose heartbeat is within `ttlMs` of `nowMs` are "online". */
export function activePresence(rows: PresenceRow[], nowMs: number, ttlMs: number): PresenceUser[] {
  const cutoff = nowMs - ttlMs;
  return rows
    .filter((r) => new Date(r.lastSeen).getTime() >= cutoff)
    .map((r) => ({ userId: r.userId, name: r.name }));
}
