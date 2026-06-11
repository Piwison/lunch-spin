import { EventEmitter, on } from "node:events";
import type { SessionState } from "@shared/session";

/**
 * In-process pub/sub for live shared wheels: spin broadcasts and presence.
 *
 * This is intentionally single-process (good for one Node instance). Scaling to
 * multiple instances would swap these emitters for Redis pub/sub or similar
 * behind the same interface.
 */

export interface SpinEvent {
  id: number;
  restaurantId: number;
  restaurantName: string;
  spunBy: number;
  spunByName: string | null;
}

export interface PresenceUser {
  userId: number;
  name: string | null;
}

const spinEmitter = new EventEmitter();
spinEmitter.setMaxListeners(0);
const presenceEmitter = new EventEmitter();
presenceEmitter.setMaxListeners(0);

// wheelId -> userId -> { connections, name }. Ref-counted so multiple tabs /
// connections from one user collapse to a single presence entry.
const presence = new Map<number, Map<number, { connections: number; name: string | null }>>();

export function emitSpin(wheelId: number, event: SpinEvent): void {
  spinEmitter.emit(String(wheelId), event);
}

export async function* spinIterator(wheelId: number, signal: AbortSignal): AsyncGenerator<SpinEvent> {
  for await (const [event] of on(spinEmitter, String(wheelId), { signal })) {
    yield event as SpinEvent;
  }
}

export function getPresence(wheelId: number): PresenceUser[] {
  const m = presence.get(wheelId);
  if (!m) return [];
  return Array.from(m, ([userId, v]) => ({ userId, name: v.name }));
}

export function joinPresence(wheelId: number, userId: number, name: string | null): void {
  let m = presence.get(wheelId);
  if (!m) {
    m = new Map();
    presence.set(wheelId, m);
  }
  const cur = m.get(userId);
  if (cur) cur.connections++;
  else m.set(userId, { connections: 1, name });
  presenceEmitter.emit(String(wheelId));
}

export function leavePresence(wheelId: number, userId: number): void {
  const m = presence.get(wheelId);
  if (!m) return;
  const cur = m.get(userId);
  if (!cur) return;
  cur.connections--;
  if (cur.connections <= 0) m.delete(userId);
  if (m.size === 0) presence.delete(wheelId);
  presenceEmitter.emit(String(wheelId));
}

export async function* presenceIterator(wheelId: number, signal: AbortSignal): AsyncGenerator<void> {
  for await (const _ of on(presenceEmitter, String(wheelId), { signal })) {
    yield;
  }
}

// ─── Session: vetoes & votes ──────────────────────────────────────────────────

const sessionEmitter = new EventEmitter();
sessionEmitter.setMaxListeners(0);

interface SessionMaps {
  vetoes: Map<number, Set<number>>; // restaurantId -> userIds
  votes: Map<number, Set<number>>;
}

// wheelId -> ephemeral round state. Cleared on process restart (it's a "right
// now" decision moment, not durable data).
const sessions = new Map<number, SessionMaps>();

function sessionFor(wheelId: number): SessionMaps {
  let s = sessions.get(wheelId);
  if (!s) {
    s = { vetoes: new Map(), votes: new Map() };
    sessions.set(wheelId, s);
  }
  return s;
}

function toggle(map: Map<number, Set<number>>, restaurantId: number, userId: number): void {
  const set = map.get(restaurantId);
  if (set?.has(userId)) {
    set.delete(userId);
    if (set.size === 0) map.delete(restaurantId);
  } else if (set) {
    set.add(userId);
  } else {
    map.set(restaurantId, new Set([userId]));
  }
}

function marksOf(map: Map<number, Set<number>>) {
  return Array.from(map, ([restaurantId, userIds]) => ({ restaurantId, userIds: Array.from(userIds) }));
}

export function getSession(wheelId: number): SessionState {
  const s = sessions.get(wheelId);
  if (!s) return { vetoes: [], votes: [] };
  return { vetoes: marksOf(s.vetoes), votes: marksOf(s.votes) };
}

export function toggleVeto(wheelId: number, restaurantId: number, userId: number): void {
  toggle(sessionFor(wheelId).vetoes, restaurantId, userId);
  sessionEmitter.emit(String(wheelId));
}

export function toggleVote(wheelId: number, restaurantId: number, userId: number): void {
  toggle(sessionFor(wheelId).votes, restaurantId, userId);
  sessionEmitter.emit(String(wheelId));
}

/** Clear the votes only (e.g. a fresh round after a spin); vetoes persist. */
export function clearVotes(wheelId: number): void {
  const s = sessions.get(wheelId);
  if (!s || s.votes.size === 0) return;
  s.votes.clear();
  sessionEmitter.emit(String(wheelId));
}

/** Reset the whole round — both vetoes and votes. */
export function clearSession(wheelId: number): void {
  const s = sessions.get(wheelId);
  if (!s) return;
  s.vetoes.clear();
  s.votes.clear();
  sessions.delete(wheelId);
  sessionEmitter.emit(String(wheelId));
}

export async function* sessionIterator(wheelId: number, signal: AbortSignal): AsyncGenerator<void> {
  for await (const _ of on(sessionEmitter, String(wheelId), { signal })) {
    yield;
  }
}
