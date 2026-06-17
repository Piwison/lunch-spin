/**
 * Public (guest) projections for wheels & restaurants.
 *
 * Guests reach a wheel through a public link with no sign-in. These pure
 * projectors are the single chokepoint that decides which fields a guest may
 * see — they exist so PII (owner id/email, invite tokens, member roster,
 * history) can never leak through a public endpoint by accident. The server's
 * public procedures MUST shape their output through these functions, and the
 * sibling test locks the field set down so a future schema change can't widen
 * the surface silently.
 */

export interface PublicTag {
  id: number;
  name: string;
  color: string;
  category: string;
}

export interface PublicRestaurant {
  id: number;
  name: string;
  notes: string | null;
  mapUrl: string | null;
  tags: PublicTag[];
}

export interface PublicWheel {
  id: number;
  name: string;
  isPublic: boolean;
  exclusionDays: number;
}

export interface PopularWheel {
  id: number;
  name: string;
  spinCount: number;
  restaurantCount: number;
}

/** Strip a wheel row to the public-safe subset (drops ownerId, inviteToken, …). */
export function toPublicWheel(w: {
  id: number;
  name: string;
  isPublic: boolean;
  exclusionDays: number;
}): PublicWheel {
  return { id: w.id, name: w.name, isPublic: w.isPublic, exclusionDays: w.exclusionDays };
}

/** Strip a restaurant (with tags) to the public-safe subset (drops addedBy, …). */
export function toPublicRestaurant(r: {
  id: number;
  name: string;
  notes: string | null;
  mapUrl: string | null;
  tags: { id: number; name: string; color: string; category: string }[];
}): PublicRestaurant {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    mapUrl: r.mapUrl,
    tags: r.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, category: t.category })),
  };
}

/**
 * Order public wheels for the discovery list: most-spun first, then more
 * restaurants, then stable by id. Counts come from the caller (a cheap grouped
 * COUNT over spinHistory / restaurants); wheels with no spins simply rank 0.
 */
export function rankPopularWheels(
  publicWheels: { id: number; name: string }[],
  spinCounts: Map<number, number>,
  restaurantCounts: Map<number, number>,
  limit: number,
): PopularWheel[] {
  return publicWheels
    .map((w) => ({
      id: w.id,
      name: w.name,
      spinCount: spinCounts.get(w.id) ?? 0,
      restaurantCount: restaurantCounts.get(w.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.spinCount - a.spinCount ||
        b.restaurantCount - a.restaurantCount ||
        a.id - b.id,
    )
    .slice(0, Math.max(0, limit));
}
