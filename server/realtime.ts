import { EventEmitter, on } from "node:events";

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
