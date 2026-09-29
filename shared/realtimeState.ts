// Pure transforms backing the polling-based realtime layer: rebuild the
// SessionState from round_marks rows, and filter presence heartbeats by TTL.

import { taipeiDayIndex } from "./lunch";
import type { SessionState } from "./session";

export type MarkKind = "veto" | "vote" | "dietary";
export type RoundMarkRow = { kind: MarkKind; refId: number; userId: number; createdAt: Date | string | number };

function push(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * A vote or veto counts on the Taipei day it was made, and only that day.
 * "Not today" used to last until someone pressed Clear round, so Monday's veto
 * was still keeping a place off the wheel on Thursday.
 */
export function isActiveMark(row: Pick<RoundMarkRow, "createdAt">, now: Date): boolean {
  return taipeiDayIndex(new Date(row.createdAt)) === taipeiDayIndex(now);
}

/**
 * Group today's round_marks rows into the shared SessionState shape, keyed by
 * restaurantId (refId). Rows from an earlier day are ignored, not deleted.
 * Legacy `dietary` rows are ignored too: "I don't eat" is a personal setting in
 * user_dietary now, and `dietary` here is filled in from that by the caller
 * (shared/session `dietaryForPresent`).
 */
export function buildSessionState(rows: RoundMarkRow[], now: Date): SessionState {
  const vetoes = new Map<number, number[]>();
  const votes = new Map<number, number[]>();
  for (const r of rows) {
    if (!isActiveMark(r, now)) continue;
    if (r.kind === "veto") push(vetoes, r.refId, r.userId);
    else if (r.kind === "vote") push(votes, r.refId, r.userId);
  }
  return {
    vetoes: Array.from(vetoes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    votes: Array.from(votes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    dietary: [],
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
