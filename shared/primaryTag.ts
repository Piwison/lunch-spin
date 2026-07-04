/**
 * Single source of truth for a restaurant's "primary tag" — the tag that
 * determines its wheel-segment colour and the list swatch.
 *
 * The DB stores `primaryTagId` (the first tag id at add/update time), but the
 * `tags` array's order isn't guaranteed by the join that builds it, so `tags[0]`
 * can disagree with the recorded primary. Resolve from `primaryTagId` first,
 * falling back to the first attached tag, then null. Pure + tested so the wheel
 * segment, the list dot, and the recorded primary can never drift apart.
 */

export interface TagLike {
  id: number;
}

export interface RestaurantLike<T extends TagLike> {
  primaryTagId?: number | null;
  tags: T[];
}

/** The tag that owns a restaurant's colour, or null if it has no tags. */
export function primaryTag<T extends TagLike>(r: RestaurantLike<T>): T | null {
  if (r.primaryTagId != null) {
    const match = r.tags.find((t) => t.id === r.primaryTagId);
    if (match) return match;
  }
  return r.tags[0] ?? null;
}
