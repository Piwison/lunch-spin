import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  Restaurant,
  Tag,
  notifications,
  restaurantRatings,
  restaurantTags,
  restaurants,
  roundMarks,
  spinHistory,
  tags,
  users,
  wheelMembers,
  wheelPresence,
  wheels,
} from "../drizzle/schema";
import type { MarkKind, RoundMarkRow } from "@shared/realtimeState";
import { ENV } from "./_core/env";
import { computeExclusions, DEFAULT_EXCLUSION_DAYS } from "@shared/exclusion";
import { normalizeStatRow } from "@shared/stats";
import { rankPopularWheels } from "@shared/publicWheel";
import type { WheelExport } from "@shared/transfer";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return result[0];
}

export async function setUserDefaultWheel(userId: number, wheelId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ defaultWheelId: wheelId }).where(eq(users.id, userId));
}

// ─── Wheels ───────────────────────────────────────────────────────────────────

export async function createWheel(ownerId: number, name: string, isShared: boolean, isPublic: boolean, inviteToken?: string, exclusionDays: number = DEFAULT_EXCLUSION_DAYS, fairnessMode = false, rotateCuisines = false) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(wheels).values({ ownerId, name, isShared, isPublic, inviteToken: inviteToken ?? null, exclusionDays, fairnessMode, rotateCuisines });
  return (result as any)[0].insertId as number;
}

export async function getWheelById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(wheels).where(eq(wheels.id, id)).limit(1);
  return result[0];
}

export async function getWheelByInviteToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(wheels).where(eq(wheels.inviteToken, token)).limit(1);
  return result[0];
}

// Public (guest) discovery: public wheels ranked by spin count, then size.
// Counts come from two cheap grouped COUNTs scoped to the public wheel ids;
// the ranking/limit is the pure `rankPopularWheels`. Public wheels are few, so
// joining the counts in memory keeps the query simple and avoids subquery edge
// cases. Returns [] when the DB is unavailable.
export async function getPopularPublicWheels(limit: number) {
  const db = await getDb();
  if (!db) return [];
  const pub = await db
    .select({ id: wheels.id, name: wheels.name })
    .from(wheels)
    .where(eq(wheels.isPublic, true));
  if (pub.length === 0) return [];
  const ids = pub.map((w) => w.id);
  const spinRows = await db
    .select({ wheelId: spinHistory.wheelId, c: sql<number>`count(*)` })
    .from(spinHistory)
    .where(inArray(spinHistory.wheelId, ids))
    .groupBy(spinHistory.wheelId);
  const restRows = await db
    .select({ wheelId: restaurants.wheelId, c: sql<number>`count(*)` })
    .from(restaurants)
    .where(inArray(restaurants.wheelId, ids))
    .groupBy(restaurants.wheelId);
  const spinCounts = new Map(spinRows.map((r) => [r.wheelId, Number(r.c)]));
  const restCounts = new Map(restRows.map((r) => [r.wheelId, Number(r.c)]));
  return rankPopularWheels(pub, spinCounts, restCounts, limit);
}

export async function getUserWheels(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // ONE query, not three. This sits on the app-entry critical path (wheels.list
  // and wheels.bootstrap both start here), and the previous shape — owned, then
  // memberships, then the joined wheels — was three *sequential* round trips,
  // each paying full latency to a TiDB cluster that may be cold. The membership
  // lookup is now a subquery; both sides are index-backed (wheels_owner_idx,
  // wheel_members_user_idx from migration 0014).
  const rows = await db
    .select()
    .from(wheels)
    .where(
      or(
        eq(wheels.ownerId, userId),
        inArray(
          wheels.id,
          db.select({ id: wheelMembers.wheelId }).from(wheelMembers).where(eq(wheelMembers.userId, userId)),
        ),
      ),
    );
  // Preserve the previous ordering (owned first, then joined): callers treat
  // wheels[0] as the fallback default wheel, so the order is behaviour.
  const owned = rows.filter((w) => w.ownerId === userId);
  const joined = rows.filter((w) => w.ownerId !== userId);
  return [...owned, ...joined];
}

export async function updateWheel(id: number, data: Partial<{ name: string; isPublic: boolean; isShared: boolean; inviteToken: string | null; exclusionDays: number; fairnessMode: boolean; rotateCuisines: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(wheels).set(data).where(eq(wheels.id, id));
}

// Distance mode: kept separate from updateWheel because it needs the
// decimal-column string conversion (see addRestaurant) and is driven by an
// async place-resolution flow, not the plain settings form.
export async function setWheelOrigin(
  id: number,
  data: { distanceEnabled: boolean; originLat: number | null; originLng: number | null; originLabel: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(wheels).set({
    distanceEnabled: data.distanceEnabled,
    originLat: data.originLat == null ? null : String(data.originLat),
    originLng: data.originLng == null ? null : String(data.originLng),
    originLabel: data.originLabel,
  }).where(eq(wheels.id, id));
}

export async function deleteWheel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(wheels).where(eq(wheels.id, id));
}

export async function isWheelMember(wheelId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  const wheel = await getWheelById(wheelId);
  if (!wheel) return false;
  if (wheel.ownerId === userId) return true;
  const result = await db.select().from(wheelMembers).where(and(eq(wheelMembers.wheelId, wheelId), eq(wheelMembers.userId, userId))).limit(1);
  return result.length > 0;
}

export async function addWheelMember(wheelId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(wheelMembers).where(and(eq(wheelMembers.wheelId, wheelId), eq(wheelMembers.userId, userId))).limit(1);
  if (existing.length > 0) return;
  await db.insert(wheelMembers).values({ wheelId, userId });
}

export async function getWheelMembers(wheelId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: wheelMembers.id, userId: wheelMembers.userId, joinedAt: wheelMembers.joinedAt, name: users.name, email: users.email })
    .from(wheelMembers)
    .innerJoin(users, eq(wheelMembers.userId, users.id))
    .where(eq(wheelMembers.wheelId, wheelId));
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

// Returns global/system tags (wheelId IS NULL) plus the given wheel's own
// custom tags — so one team's custom vocabulary never leaks into another's.
export async function getTagsForWheel(wheelId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tags)
    .where(or(isNull(tags.wheelId), eq(tags.wheelId, wheelId)));
}

export async function createCustomTag(
  name: string,
  createdBy: number,
  wheelId: number,
  category: "cuisine" | "food_type" | "custom" = "custom",
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Assign a color from a palette based on name hash
  const colors = ["#f43f5e","#fb923c","#facc15","#4ade80","#22d3ee","#818cf8","#e879f9","#94a3b8"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const result = await db.insert(tags).values({ name, category, color: color!, createdBy, wheelId });
  return (result as any)[0].insertId as number;
}

// ─── Restaurants ──────────────────────────────────────────────────────────────

export async function getRestaurantsByWheel(wheelId: number) {
  const db = await getDb();
  if (!db) return [];
  const rests = await db.select().from(restaurants).where(eq(restaurants.wheelId, wheelId));
  if (rests.length === 0) return [];
  const restIds = rests.map((r) => r.id);
  const rtags = await db
    .select({ restaurantId: restaurantTags.restaurantId, tagId: restaurantTags.tagId, tagName: tags.name, tagColor: tags.color, tagCategory: tags.category })
    .from(restaurantTags)
    .innerJoin(tags, eq(restaurantTags.tagId, tags.id))
    .where(inArray(restaurantTags.restaurantId, restIds));
  return rests.map((r) => ({
    ...r,
    tags: rtags.filter((t) => t.restaurantId === r.id).map((t) => ({ id: t.tagId, name: t.tagName, color: t.tagColor, category: t.tagCategory })),
  }));
}

// Optional located-place fields carried when a restaurant originates from the
// place provider (source="provider") rather than being user-typed.
export interface PlaceFields {
  placeId: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  priceLevel: number | null;
  cuisine: string | null;
  openHours?: unknown;
}

export async function addRestaurant(
  wheelId: number,
  addedBy: number,
  name: string,
  notes: string | null,
  tagIds: number[],
  mapUrl: string | null = null,
  place: PlaceFields | null = null,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  const result = await db.insert(restaurants).values({
    wheelId,
    addedBy,
    name,
    notes,
    mapUrl,
    primaryTagId,
    ...(place
      ? {
          placeId: place.placeId,
          // decimal columns take strings in drizzle-mysql; null stays null.
          lat: place.lat == null ? null : String(place.lat),
          lng: place.lng == null ? null : String(place.lng),
          address: place.address,
          priceLevel: place.priceLevel,
          cuisine: place.cuisine,
          openHours: place.openHours ?? null,
          source: "provider" as const,
        }
      : {}),
  });
  const restaurantId = (result as any)[0].insertId as number;
  if (tagIds.length > 0) {
    await db.insert(restaurantTags).values(tagIds.map((tagId) => ({ restaurantId, tagId })));
  }
  return restaurantId;
}

// Provider place ids already on a wheel — used to de-duplicate "Add nearby" so
// the same physical restaurant can't be added twice. User-typed rows have a
// null placeId and never appear here.
export async function getWheelPlaceIds(wheelId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ placeId: restaurants.placeId })
    .from(restaurants)
    .where(eq(restaurants.wheelId, wheelId));
  const ids = new Set<string>();
  for (const r of rows) if (r.placeId) ids.add(r.placeId);
  return ids;
}

// Bulk-insert restaurants by name only (used by paste import). Returns the
// number of rows created.
export async function addRestaurants(wheelId: number, addedBy: number, names: string[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (names.length === 0) return 0;
  await db.insert(restaurants).values(names.map((name) => ({ wheelId, addedBy, name, notes: null })));
  return names.length;
}

export async function updateRestaurant(id: number, name: string, notes: string | null, tagIds: number[], mapUrl: string | null = null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  await db.update(restaurants).set({ name, notes, mapUrl, primaryTagId }).where(eq(restaurants.id, id));
  await db.delete(restaurantTags).where(eq(restaurantTags.restaurantId, id));
  if (tagIds.length > 0) {
    await db.insert(restaurantTags).values(tagIds.map((tagId) => ({ restaurantId: id, tagId })));
  }
}

export async function deleteRestaurant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(restaurantTags).where(eq(restaurantTags.restaurantId, id));
  await db.delete(restaurants).where(eq(restaurants.id, id));
}

// Caches coordinates resolved from a restaurant's saved Maps link (distance
// mode only pays this cost once per restaurant, not on every recompute).
export async function setRestaurantCoords(id: number, lat: number, lng: number, address: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(restaurants).set({ lat: String(lat), lng: String(lng), address: address ?? undefined }).where(eq(restaurants.id, id));
}

export async function setRestaurantWalkSeconds(id: number, walkSeconds: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(restaurants).set({ walkSeconds }).where(eq(restaurants.id, id));
}

const TAG_PALETTE = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#94a3b8"];

// Create a fresh wheel from a portable export bundle: the wheel, its tags (reuse
// matching global/system tags by name+category, else create wheel-scoped ones),
// and its restaurants. Returns the new wheel id.
export async function importWheelData(ownerId: number, data: WheelExport): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const wheelId = await createWheel(ownerId, data.name, false, false, undefined, data.exclusionDays, data.fairnessMode, data.rotateCuisines);

  const key = (name: string, category: string) => `${category}:${name.toLowerCase()}`;
  const tagMap = new Map<string, number>();
  for (const t of await getTagsForWheel(wheelId)) tagMap.set(key(t.name, t.category), t.id);

  for (const r of data.restaurants) {
    const tagIds: number[] = [];
    for (const tg of r.tags) {
      const k = key(tg.name, tg.category);
      let id = tagMap.get(k);
      if (id == null) {
        const color = TAG_PALETTE[tg.name.charCodeAt(0) % TAG_PALETTE.length]!;
        const res = await db.insert(tags).values({ name: tg.name, category: tg.category, color, createdBy: ownerId, wheelId });
        id = (res as any)[0].insertId as number;
        tagMap.set(k, id);
      }
      tagIds.push(id);
    }
    await addRestaurant(wheelId, ownerId, r.name, r.notes, tagIds);
  }
  return wheelId;
}

export async function getRestaurantById(id: number): Promise<Restaurant | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return result[0];
}

/** Store fetched opening hours for a restaurant (null periods = still unknown). */
export async function setRestaurantHours(
  id: number,
  openHours: unknown,
  utcOffsetMinutes: number | null,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(restaurants)
    .set({ openHours: openHours ?? null, utcOffsetMinutes, hoursUpdatedAt: new Date() })
    .where(eq(restaurants.id, id));
}

/** Remember the provider place a restaurant resolved to, so later hour/detail
 *  refreshes don't have to resolve its Maps link again. */
export async function setRestaurantPlaceId(id: number, placeId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(restaurants).set({ placeId }).where(eq(restaurants.id, id));
}

/**
 * Restaurants on this wheel whose hours are worth (re)fetching: hours were never
 * fetched (or are older than `staleAfterMs`) AND we have something to look them
 * up with — a provider `placeId`, or a saved Maps `mapUrl` we can resolve into
 * one. Requiring a placeId alone missed every hand-added restaurant, including
 * ones added by pasting a Maps link, since restaurants.add never stored it.
 */
export async function getRestaurantsNeedingHours(wheelId: number, staleAfterMs: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: restaurants.id,
      placeId: restaurants.placeId,
      mapUrl: restaurants.mapUrl,
      hoursUpdatedAt: restaurants.hoursUpdatedAt,
    })
    .from(restaurants)
    .where(eq(restaurants.wheelId, wheelId));
  const cutoff = Date.now() - staleAfterMs;
  return rows.filter(
    (r) =>
      (r.placeId || r.mapUrl) &&
      (!r.hoursUpdatedAt || new Date(r.hoursUpdatedAt).getTime() < cutoff),
  );
}

// ─── Restaurant ratings ───────────────────────────────────────────────────────

/** Upsert one member's 1–5 star rating for a restaurant (re-rating overwrites). */
export async function upsertRestaurantRating(restaurantId: number, userId: number, stars: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(restaurantRatings)
    .values({ restaurantId, userId, stars })
    .onDuplicateKeyUpdate({ set: { stars } });
}

/** All star rows for a wheel's restaurants — small; aggregated by
 *  shared/restaurantRating (summarizeRatings / averageMapFromRows). */
export async function getWheelRatingRows(
  wheelId: number,
): Promise<{ restaurantId: number; userId: number; stars: number }[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      restaurantId: restaurantRatings.restaurantId,
      userId: restaurantRatings.userId,
      stars: restaurantRatings.stars,
    })
    .from(restaurantRatings)
    .innerJoin(restaurants, eq(restaurantRatings.restaurantId, restaurants.id))
    .where(eq(restaurants.wheelId, wheelId));
}

// ─── Spin History ─────────────────────────────────────────────────────────────

export async function recordSpin(wheelId: number, restaurantId: number, spunBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(spinHistory).values({ wheelId, restaurantId, spunBy });
  return (result as any)[0].insertId as number;
}

export async function getSpinHistory(wheelId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: spinHistory.id,
      restaurantId: spinHistory.restaurantId,
      restaurantName: restaurants.name,
      spunBy: spinHistory.spunBy,
      spunByName: users.name,
      spunAt: spinHistory.spunAt,
      manuallyReenabled: spinHistory.manuallyReenabled,
      rating: spinHistory.rating,
    })
    .from(spinHistory)
    .innerJoin(restaurants, eq(spinHistory.restaurantId, restaurants.id))
    .innerJoin(users, eq(spinHistory.spunBy, users.id))
    .where(eq(spinHistory.wheelId, wheelId))
    .orderBy(sql`${spinHistory.spunAt} DESC`);
}

// Set (or change) the "how was it?" verdict on one spin. Scoped to the wheel
// and to the spin's own author (spunBy) so a member can only rate a spin they
// made. Returns the affected restaurantId, or null if nothing matched.
export async function rateSpin(
  spinId: number,
  wheelId: number,
  spunBy: number,
  rating: "loved" | "ok" | "never",
): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({ restaurantId: spinHistory.restaurantId })
    .from(spinHistory)
    .where(and(eq(spinHistory.id, spinId), eq(spinHistory.wheelId, wheelId), eq(spinHistory.spunBy, spunBy)))
    .limit(1);
  if (rows.length === 0) return null;
  await db.update(spinHistory).set({ rating }).where(eq(spinHistory.id, spinId));
  return rows[0]!.restaurantId;
}

// The latest rating per restaurant on a wheel (most-recent rated spin wins) —
// the persistent preference signal that biases future spins. Restaurants with
// no rated spin are simply absent.
export async function getLatestRatings(wheelId: number): Promise<Map<number, "loved" | "ok" | "never">> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({
      restaurantId: spinHistory.restaurantId,
      rating: spinHistory.rating,
      spunAt: spinHistory.spunAt,
    })
    .from(spinHistory)
    .where(and(eq(spinHistory.wheelId, wheelId), sql`${spinHistory.rating} IS NOT NULL`))
    .orderBy(sql`${spinHistory.spunAt} DESC`);
  const latest = new Map<number, "loved" | "ok" | "never">();
  for (const r of rows) {
    if (r.rating && !latest.has(r.restaurantId)) latest.set(r.restaurantId, r.rating);
  }
  return latest;
}

// Returns a map of restaurantId → the timestamp it becomes available again.
// `windowDays` of 0 disables exclusion entirely (empty map).
export async function getExclusions(wheelId: number, windowDays: number): Promise<Map<number, Date>> {
  const db = await getDb();
  if (!db || windowDays <= 0) return new Map();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      restaurantId: spinHistory.restaurantId,
      spunAt: spinHistory.spunAt,
      manuallyReenabled: spinHistory.manuallyReenabled,
      accepted: spinHistory.accepted,
    })
    .from(spinHistory)
    .where(and(eq(spinHistory.wheelId, wheelId), sql`${spinHistory.spunAt} > ${cutoff}`));
  const exclusions = computeExclusions(recent, { windowDays });
  return new Map(exclusions.map((e) => [e.restaurantId, e.excludedUntil]));
}

export async function reenableRestaurant(wheelId: number, restaurantId: number, windowDays: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  await db
    .update(spinHistory)
    .set({ manuallyReenabled: true })
    .where(and(eq(spinHistory.wheelId, wheelId), eq(spinHistory.restaurantId, restaurantId), sql`${spinHistory.spunAt} > ${cutoff}`));
}

// ─── Accept + notifications ───────────────────────────────────────────────────

// Mark a spin as ACCEPTED ("we're eating here"): flips it to the full-window
// exclusion tier and, for shared wheels, fans a notification out to the team.
// Scoped to the spin's own author so only the person who spun can accept it.
// Returns the accepted spin's details, or null if it didn't match / was already
// accepted (idempotent — a double-tap won't create duplicate notifications).
export async function acceptSpin(
  spinId: number,
  wheelId: number,
  actorUserId: number,
): Promise<{ restaurantId: number; isShared: boolean } | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({ restaurantId: spinHistory.restaurantId, accepted: spinHistory.accepted })
    .from(spinHistory)
    .where(and(eq(spinHistory.id, spinId), eq(spinHistory.wheelId, wheelId), eq(spinHistory.spunBy, actorUserId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.accepted) return null;

  await db.update(spinHistory).set({ accepted: true }).where(eq(spinHistory.id, spinId));

  const wheel = await getWheelById(wheelId);
  const isShared = wheel?.isShared ?? false;
  if (isShared) {
    await db.insert(notifications).values({ wheelId, spinId, restaurantId: row.restaurantId, actorUserId });
  }
  return { restaurantId: row.restaurantId, isShared };
}

// Recent notifications for wheels this user belongs to, excluding ones they
// triggered themselves. `unread` is computed against the user's read high-water
// mark. Newest first, capped so the bell panel stays a short list.
export async function getNotificationsForUser(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const wheelIds = (await getUserWheels(userId)).map((w) => w.id);
  if (wheelIds.length === 0) return [];

  const meRows = await db
    .select({ readAt: users.lastReadNotificationAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const readAt = meRows[0]?.readAt ?? null;

  const rows = await db
    .select({
      id: notifications.id,
      wheelId: notifications.wheelId,
      wheelName: wheels.name,
      restaurantId: notifications.restaurantId,
      restaurantName: restaurants.name,
      mapUrl: restaurants.mapUrl,
      actorName: users.name,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(wheels, eq(notifications.wheelId, wheels.id))
    .innerJoin(restaurants, eq(notifications.restaurantId, restaurants.id))
    .innerJoin(users, eq(notifications.actorUserId, users.id))
    .where(and(inArray(notifications.wheelId, wheelIds), sql`${notifications.actorUserId} <> ${userId}`))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, unread: readAt == null || r.createdAt > readAt }));
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ lastReadNotificationAt: new Date() }).where(eq(users.id, userId));
}


// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getRestaurantStats(wheelId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  // Get pick count and last picked date for each restaurant in the wheel
  const result = await db.execute(sql`
    SELECT
      r.id,
      r.name,
      COUNT(sh.id) as pickCount,
      MAX(sh.spunAt) as lastPickedAt
    FROM ${restaurants} r
    LEFT JOIN ${spinHistory} sh ON r.id = sh.restaurantId
    WHERE r.wheelId = ${wheelId}
    GROUP BY r.id, r.name
    ORDER BY pickCount DESC, lastPickedAt DESC
  `);

  // mysql2's `execute` resolves to a `[rows, fields]` tuple; unwrap to the rows
  // array. (Mapping over the tuple itself yielded malformed rows with no name,
  // which crashed the stats UI.) Tolerate a driver that already returns rows.
  // `normalizeStatRow` coerces each field, so the row type only needs to name
  // the columns the SELECT produces — no `any`.
  type StatRow = { id: number; name: string; pickCount: unknown; lastPickedAt: unknown };
  const raw: unknown = result;
  const rows: StatRow[] = Array.isArray(raw)
    ? Array.isArray(raw[0])
      ? (raw[0] as StatRow[])
      : (raw as StatRow[])
    : [];
  return rows.map(normalizeStatRow);
}

// ─── Serverless realtime (polling-backed) ────────────────────────────────────

/** Upsert this user's heartbeat for a wheel. */
export async function pingPresence(wheelId: number, userId: number, name: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db
    .insert(wheelPresence)
    .values({ wheelId, userId, name, lastSeen: now })
    .onDuplicateKeyUpdate({ set: { lastSeen: now, name } });
}

/** Presence heartbeats for a wheel seen at/after `cutoff`. */
export async function getActivePresence(wheelId: number, cutoff: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ userId: wheelPresence.userId, name: wheelPresence.name, lastSeen: wheelPresence.lastSeen })
    .from(wheelPresence)
    .where(and(eq(wheelPresence.wheelId, wheelId), gte(wheelPresence.lastSeen, cutoff)));
}

/** Toggle one round mark (veto/vote on a restaurant, or dietary on a tag). */
export async function toggleRoundMark(wheelId: number, kind: MarkKind, refId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const where = and(
    eq(roundMarks.wheelId, wheelId),
    eq(roundMarks.kind, kind),
    eq(roundMarks.refId, refId),
    eq(roundMarks.userId, userId),
  );
  const existing = await db.select({ userId: roundMarks.userId }).from(roundMarks).where(where).limit(1);
  if (existing.length > 0) {
    await db.delete(roundMarks).where(where);
  } else {
    // Idempotent insert so a concurrent double-toggle can't crash on the PK.
    await db
      .insert(roundMarks)
      .values({ wheelId, kind, refId, userId })
      .onDuplicateKeyUpdate({ set: { userId } });
  }
}

/** All round marks for a wheel (shape consumed by buildSessionState). */
export async function getRoundMarks(wheelId: number): Promise<RoundMarkRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ kind: roundMarks.kind, refId: roundMarks.refId, userId: roundMarks.userId })
    .from(roundMarks)
    .where(eq(roundMarks.wheelId, wheelId));
}

/** Clear just the votes for a wheel (after a spin resolves). */
export async function clearRoundVotes(wheelId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(roundMarks).where(and(eq(roundMarks.wheelId, wheelId), eq(roundMarks.kind, "vote")));
}

/** Clear all round marks for a wheel. */
export async function clearRoundAll(wheelId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(roundMarks).where(eq(roundMarks.wheelId, wheelId));
}

/** Most recent spin on a wheel (for the polled "someone spun" broadcast). */
export async function getLatestSpin(wheelId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: spinHistory.id,
      restaurantId: spinHistory.restaurantId,
      restaurantName: restaurants.name,
      spunBy: spinHistory.spunBy,
      spunByName: users.name,
      spunAt: spinHistory.spunAt,
    })
    .from(spinHistory)
    .innerJoin(restaurants, eq(spinHistory.restaurantId, restaurants.id))
    .innerJoin(users, eq(spinHistory.spunBy, users.id))
    .where(eq(spinHistory.wheelId, wheelId))
    .orderBy(desc(spinHistory.id))
    .limit(1);
  return rows[0] ?? null;
}
