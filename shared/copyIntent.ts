/**
 * "Copy this wheel", carried from a shared link into the app.
 *
 * A guest has no session to copy with, so the intent cannot be a mutation — it
 * travels in the URL (/w/:id -> /app?copyFrom=N), survives the round trip
 * through Google sign-in, and is performed by WheelApp once there is a user.
 * That makes the value attacker-supplied by construction: it is whatever was in
 * the address bar, and it is about to name the row a mutation reads. So parsing
 * it is a real decision rather than a `parseInt`, and it lives here with the
 * rest of the pure logic instead of inline in the two components that share it.
 */

export const COPY_INTENT_PARAM = "copyFrom";

/** The app URL that copies `wheelId` once the visitor is signed in. */
export function copyIntentUrl(wheelId: number): string {
  return `/app?${COPY_INTENT_PARAM}=${wheelId}`;
}

/**
 * The wheel id to copy, or null when there is no usable intent.
 *
 * Null for absent, non-numeric, non-integer, zero, negative, and anything past
 * the safe-integer range — ids are MySQL autoincrement ints, so none of those
 * can name a row, and passing them on would just turn a junk URL into a
 * NOT_FOUND round trip. Accepts a search string with or without the leading "?".
 */
export function readCopyIntent(search: string): number | null {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(COPY_INTENT_PARAM);
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
