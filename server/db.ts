import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  Restaurant,
  Tag,
  restaurantTags,
  restaurants,
  spinHistory,
  tags,
  users,
  wheelMembers,
  wheels,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { computeExcludedIds, DEFAULT_EXCLUSION_DAYS } from "@shared/exclusion";
import { normalizeStatRow } from "@shared/stats";

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

// ─── Wheels ───────────────────────────────────────────────────────────────────

export async function createWheel(ownerId: number, name: string, isShared: boolean, isPublic: boolean, inviteToken?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(wheels).values({ ownerId, name, isShared, isPublic, inviteToken: inviteToken ?? null });
  return (result as any).insertId as number;
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

export async function getUserWheels(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Own wheels
  const owned = await db.select().from(wheels).where(eq(wheels.ownerId, userId));
  // Joined shared wheels
  const memberships = await db.select({ wheelId: wheelMembers.wheelId }).from(wheelMembers).where(eq(wheelMembers.userId, userId));
  const memberWheelIds = memberships.map((m) => m.wheelId).filter((id) => !owned.find((w) => w.id === id));
  const joined = memberWheelIds.length > 0 ? await db.select().from(wheels).where(inArray(wheels.id, memberWheelIds)) : [];
  return [...owned, ...joined];
}

export async function updateWheel(id: number, data: Partial<{ name: string; isPublic: boolean; inviteToken: string | null }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(wheels).set(data).where(eq(wheels.id, id));
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

export async function createCustomTag(name: string, createdBy: number, wheelId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Assign a color from a palette based on name hash
  const colors = ["#f43f5e","#fb923c","#facc15","#4ade80","#22d3ee","#818cf8","#e879f9","#94a3b8"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const [result] = await db.insert(tags).values({ name, category: "custom", color: color!, createdBy, wheelId });
  return (result as any).insertId as number;
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

export async function addRestaurant(wheelId: number, addedBy: number, name: string, notes: string | null, tagIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  const [result] = await db.insert(restaurants).values({ wheelId, addedBy, name, notes, primaryTagId });
  const restaurantId = (result as any).insertId as number;
  if (tagIds.length > 0) {
    await db.insert(restaurantTags).values(tagIds.map((tagId) => ({ restaurantId, tagId })));
  }
  return restaurantId;
}

export async function updateRestaurant(id: number, name: string, notes: string | null, tagIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  await db.update(restaurants).set({ name, notes, primaryTagId }).where(eq(restaurants.id, id));
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

export async function getRestaurantById(id: number): Promise<Restaurant | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return result[0];
}

// ─── Spin History ─────────────────────────────────────────────────────────────

export async function recordSpin(wheelId: number, restaurantId: number, spunBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(spinHistory).values({ wheelId, restaurantId, spunBy });
  return (result as any).insertId as number;
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
    })
    .from(spinHistory)
    .innerJoin(restaurants, eq(spinHistory.restaurantId, restaurants.id))
    .innerJoin(users, eq(spinHistory.spunBy, users.id))
    .where(eq(spinHistory.wheelId, wheelId))
    .orderBy(sql`${spinHistory.spunAt} DESC`);
}

export async function getExcludedRestaurantIds(wheelId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - DEFAULT_EXCLUSION_DAYS * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      restaurantId: spinHistory.restaurantId,
      spunAt: spinHistory.spunAt,
      manuallyReenabled: spinHistory.manuallyReenabled,
    })
    .from(spinHistory)
    .where(and(eq(spinHistory.wheelId, wheelId), sql`${spinHistory.spunAt} > ${cutoff}`));
  return computeExcludedIds(recent);
}

export async function reenableRestaurant(wheelId: number, restaurantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await db
    .update(spinHistory)
    .set({ manuallyReenabled: true })
    .where(and(eq(spinHistory.wheelId, wheelId), eq(spinHistory.restaurantId, restaurantId), sql`${spinHistory.spunAt} > ${threeDaysAgo}`));
}


// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getRestaurantStats(wheelId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  // Get pick count and last picked date for each restaurant in the wheel
  const stats = await db.execute(sql`
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
  
  return (stats as any[]).map(normalizeStatRow);
}
