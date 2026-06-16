// server/_core/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var wheels = mysqlTable("wheels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  ownerId: int("ownerId").notNull(),
  isShared: boolean("isShared").default(false).notNull(),
  isPublic: boolean("isPublic").default(false).notNull(),
  inviteToken: varchar("inviteToken", { length: 64 }),
  // Days a spun restaurant is excluded from the wheel; 0 = exclusion off.
  exclusionDays: int("exclusionDays").default(3).notNull(),
  // Fairness mode: weight the spin toward neglected restaurants.
  fairnessMode: boolean("fairnessMode").default(false).notNull(),
  // Rotate cuisines: damp recently-picked cuisines, boost neglected ones.
  rotateCuisines: boolean("rotateCuisines").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var wheelMembers = mysqlTable("wheel_members", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull()
});
var tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  category: mysqlEnum("category", ["cuisine", "food_type", "custom"]).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
  createdBy: int("createdBy"),
  // null = predefined system tag
  wheelId: int("wheelId"),
  // null = global/system tag; otherwise scoped to one wheel
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  notes: text("notes"),
  mapUrl: varchar("mapUrl", { length: 512 }),
  // optional Google Maps link for DIRECTIONS
  addedBy: int("addedBy").notNull(),
  primaryTagId: int("primaryTagId"),
  // determines wheel segment color
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var restaurantTags = mysqlTable("restaurant_tags", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  tagId: int("tagId").notNull()
});
var spinHistory = mysqlTable("spin_history", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  spunBy: int("spunBy").notNull(),
  spunAt: timestamp("spunAt").defaultNow().notNull(),
  // If true, user manually re-enabled this restaurant before 3-day window expires
  manuallyReenabled: boolean("manuallyReenabled").default(false).notNull()
});
var wheelPresence = mysqlTable("wheel_presence", {
  wheelId: int("wheelId").notNull(),
  userId: int("userId").notNull(),
  name: text("name"),
  lastSeen: timestamp("lastSeen").defaultNow().notNull()
}, (t2) => ({ pk: primaryKey({ columns: [t2.wheelId, t2.userId] }) }));
var roundMarks = mysqlTable("round_marks", {
  wheelId: int("wheelId").notNull(),
  kind: mysqlEnum("kind", ["veto", "vote", "dietary"]).notNull(),
  refId: int("refId").notNull(),
  userId: int("userId").notNull()
}, (t2) => ({ pk: primaryKey({ columns: [t2.wheelId, t2.kind, t2.refId, t2.userId] }) }));

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Self-hosted Google sign-in (replaces Manus OAuth).
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  appOrigin: process.env.APP_ORIGIN ?? ""
};

// shared/exclusion.ts
var DEFAULT_EXCLUSION_DAYS = 3;
function computeExclusions(spins, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const windowDays = opts.windowDays ?? DEFAULT_EXCLUSION_DAYS;
  const windowMs = windowDays * 24 * 60 * 60 * 1e3;
  const cutoff = new Date(now.getTime() - windowMs);
  const recent = spins.filter((s) => s.spunAt > cutoff).sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime());
  const seen = /* @__PURE__ */ new Set();
  const exclusions = [];
  for (const row of recent) {
    if (seen.has(row.restaurantId)) continue;
    seen.add(row.restaurantId);
    if (!row.manuallyReenabled) {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: new Date(row.spunAt.getTime() + windowMs) });
    }
  }
  return exclusions;
}

// shared/stats.ts
function normalizeStatRow(row) {
  return {
    id: Number(row.id),
    // Defensive: a stray/malformed row must never produce a non-string name,
    // or the stats UI (which calls name.length) crashes the whole History tab.
    name: typeof row.name === "string" ? row.name : String(row.name ?? ""),
    pickCount: Number(row.pickCount ?? 0) || 0,
    lastPickedAt: row.lastPickedAt ? new Date(row.lastPickedAt) : null
  };
}

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    const value = user[field];
    if (value === void 0) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}
async function createWheel(ownerId, name, isShared, isPublic, inviteToken, exclusionDays = DEFAULT_EXCLUSION_DAYS, fairnessMode = false, rotateCuisines = false) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(wheels).values({ ownerId, name, isShared, isPublic, inviteToken: inviteToken ?? null, exclusionDays, fairnessMode, rotateCuisines });
  return result.insertId;
}
async function getWheelById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(wheels).where(eq(wheels.id, id)).limit(1);
  return result[0];
}
async function getWheelByInviteToken(token) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(wheels).where(eq(wheels.inviteToken, token)).limit(1);
  return result[0];
}
async function getUserWheels(userId) {
  const db = await getDb();
  if (!db) return [];
  const owned = await db.select().from(wheels).where(eq(wheels.ownerId, userId));
  const memberships = await db.select({ wheelId: wheelMembers.wheelId }).from(wheelMembers).where(eq(wheelMembers.userId, userId));
  const memberWheelIds = memberships.map((m) => m.wheelId).filter((id) => !owned.find((w) => w.id === id));
  const joined = memberWheelIds.length > 0 ? await db.select().from(wheels).where(inArray(wheels.id, memberWheelIds)) : [];
  return [...owned, ...joined];
}
async function updateWheel(id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(wheels).set(data).where(eq(wheels.id, id));
}
async function deleteWheel(id) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(wheels).where(eq(wheels.id, id));
}
async function isWheelMember(wheelId, userId) {
  const db = await getDb();
  if (!db) return false;
  const wheel = await getWheelById(wheelId);
  if (!wheel) return false;
  if (wheel.ownerId === userId) return true;
  const result = await db.select().from(wheelMembers).where(and(eq(wheelMembers.wheelId, wheelId), eq(wheelMembers.userId, userId))).limit(1);
  return result.length > 0;
}
async function addWheelMember(wheelId, userId) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(wheelMembers).where(and(eq(wheelMembers.wheelId, wheelId), eq(wheelMembers.userId, userId))).limit(1);
  if (existing.length > 0) return;
  await db.insert(wheelMembers).values({ wheelId, userId });
}
async function getWheelMembers(wheelId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: wheelMembers.id, userId: wheelMembers.userId, joinedAt: wheelMembers.joinedAt, name: users.name, email: users.email }).from(wheelMembers).innerJoin(users, eq(wheelMembers.userId, users.id)).where(eq(wheelMembers.wheelId, wheelId));
}
async function getTagsForWheel(wheelId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tags).where(or(isNull(tags.wheelId), eq(tags.wheelId, wheelId)));
}
async function createCustomTag(name, createdBy, wheelId) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const colors = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#94a3b8"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const result = await db.insert(tags).values({ name, category: "custom", color, createdBy, wheelId });
  return result.insertId;
}
async function getRestaurantsByWheel(wheelId) {
  const db = await getDb();
  if (!db) return [];
  const rests = await db.select().from(restaurants).where(eq(restaurants.wheelId, wheelId));
  if (rests.length === 0) return [];
  const restIds = rests.map((r) => r.id);
  const rtags = await db.select({ restaurantId: restaurantTags.restaurantId, tagId: restaurantTags.tagId, tagName: tags.name, tagColor: tags.color, tagCategory: tags.category }).from(restaurantTags).innerJoin(tags, eq(restaurantTags.tagId, tags.id)).where(inArray(restaurantTags.restaurantId, restIds));
  return rests.map((r) => ({
    ...r,
    tags: rtags.filter((t2) => t2.restaurantId === r.id).map((t2) => ({ id: t2.tagId, name: t2.tagName, color: t2.tagColor, category: t2.tagCategory }))
  }));
}
async function addRestaurant(wheelId, addedBy, name, notes, tagIds, mapUrl = null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  const result = await db.insert(restaurants).values({ wheelId, addedBy, name, notes, mapUrl, primaryTagId });
  const restaurantId = result.insertId;
  if (tagIds.length > 0) {
    await db.insert(restaurantTags).values(tagIds.map((tagId) => ({ restaurantId, tagId })));
  }
  return restaurantId;
}
async function addRestaurants(wheelId, addedBy, names) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (names.length === 0) return 0;
  await db.insert(restaurants).values(names.map((name) => ({ wheelId, addedBy, name, notes: null })));
  return names.length;
}
async function updateRestaurant(id, name, notes, tagIds, mapUrl = null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const primaryTagId = tagIds[0] ?? null;
  await db.update(restaurants).set({ name, notes, mapUrl, primaryTagId }).where(eq(restaurants.id, id));
  await db.delete(restaurantTags).where(eq(restaurantTags.restaurantId, id));
  if (tagIds.length > 0) {
    await db.insert(restaurantTags).values(tagIds.map((tagId) => ({ restaurantId: id, tagId })));
  }
}
async function deleteRestaurant(id) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(restaurantTags).where(eq(restaurantTags.restaurantId, id));
  await db.delete(restaurants).where(eq(restaurants.id, id));
}
var TAG_PALETTE = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#94a3b8"];
async function importWheelData(ownerId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const wheelId = await createWheel(ownerId, data.name, false, false, void 0, data.exclusionDays, data.fairnessMode, data.rotateCuisines);
  const key = (name, category) => `${category}:${name.toLowerCase()}`;
  const tagMap = /* @__PURE__ */ new Map();
  for (const t2 of await getTagsForWheel(wheelId)) tagMap.set(key(t2.name, t2.category), t2.id);
  for (const r of data.restaurants) {
    const tagIds = [];
    for (const tg of r.tags) {
      const k = key(tg.name, tg.category);
      let id = tagMap.get(k);
      if (id == null) {
        const color = TAG_PALETTE[tg.name.charCodeAt(0) % TAG_PALETTE.length];
        const res = await db.insert(tags).values({ name: tg.name, category: tg.category, color, createdBy: ownerId, wheelId });
        id = res.insertId;
        tagMap.set(k, id);
      }
      tagIds.push(id);
    }
    await addRestaurant(wheelId, ownerId, r.name, r.notes, tagIds);
  }
  return wheelId;
}
async function getRestaurantById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return result[0];
}
async function recordSpin(wheelId, restaurantId, spunBy) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(spinHistory).values({ wheelId, restaurantId, spunBy });
  return result.insertId;
}
async function getSpinHistory(wheelId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: spinHistory.id,
    restaurantId: spinHistory.restaurantId,
    restaurantName: restaurants.name,
    spunBy: spinHistory.spunBy,
    spunByName: users.name,
    spunAt: spinHistory.spunAt,
    manuallyReenabled: spinHistory.manuallyReenabled
  }).from(spinHistory).innerJoin(restaurants, eq(spinHistory.restaurantId, restaurants.id)).innerJoin(users, eq(spinHistory.spunBy, users.id)).where(eq(spinHistory.wheelId, wheelId)).orderBy(sql`${spinHistory.spunAt} DESC`);
}
async function getExclusions(wheelId, windowDays) {
  const db = await getDb();
  if (!db || windowDays <= 0) return /* @__PURE__ */ new Map();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1e3);
  const recent = await db.select({
    restaurantId: spinHistory.restaurantId,
    spunAt: spinHistory.spunAt,
    manuallyReenabled: spinHistory.manuallyReenabled
  }).from(spinHistory).where(and(eq(spinHistory.wheelId, wheelId), sql`${spinHistory.spunAt} > ${cutoff}`));
  const exclusions = computeExclusions(recent, { windowDays });
  return new Map(exclusions.map((e) => [e.restaurantId, e.excludedUntil]));
}
async function reenableRestaurant(wheelId, restaurantId, windowDays) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1e3);
  await db.update(spinHistory).set({ manuallyReenabled: true }).where(and(eq(spinHistory.wheelId, wheelId), eq(spinHistory.restaurantId, restaurantId), sql`${spinHistory.spunAt} > ${cutoff}`));
}
async function getRestaurantStats(wheelId) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
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
  const raw = result;
  const rows = Array.isArray(raw?.[0]) ? raw[0] : Array.isArray(raw) ? raw : [];
  return rows.map(normalizeStatRow);
}
async function pingPresence(wheelId, userId, name) {
  const db = await getDb();
  if (!db) return;
  const now = /* @__PURE__ */ new Date();
  await db.insert(wheelPresence).values({ wheelId, userId, name, lastSeen: now }).onDuplicateKeyUpdate({ set: { lastSeen: now, name } });
}
async function getActivePresence(wheelId, cutoff) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ userId: wheelPresence.userId, name: wheelPresence.name, lastSeen: wheelPresence.lastSeen }).from(wheelPresence).where(and(eq(wheelPresence.wheelId, wheelId), gte(wheelPresence.lastSeen, cutoff)));
}
async function toggleRoundMark(wheelId, kind, refId, userId) {
  const db = await getDb();
  if (!db) return;
  const where = and(
    eq(roundMarks.wheelId, wheelId),
    eq(roundMarks.kind, kind),
    eq(roundMarks.refId, refId),
    eq(roundMarks.userId, userId)
  );
  const existing = await db.select({ userId: roundMarks.userId }).from(roundMarks).where(where).limit(1);
  if (existing.length > 0) {
    await db.delete(roundMarks).where(where);
  } else {
    await db.insert(roundMarks).values({ wheelId, kind, refId, userId }).onDuplicateKeyUpdate({ set: { userId } });
  }
}
async function getRoundMarks(wheelId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ kind: roundMarks.kind, refId: roundMarks.refId, userId: roundMarks.userId }).from(roundMarks).where(eq(roundMarks.wheelId, wheelId));
}
async function clearRoundVotes(wheelId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(roundMarks).where(and(eq(roundMarks.wheelId, wheelId), eq(roundMarks.kind, "vote")));
}
async function clearRoundAll(wheelId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(roundMarks).where(eq(roundMarks.wheelId, wheelId));
}
async function getLatestSpin(wheelId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    id: spinHistory.id,
    restaurantId: spinHistory.restaurantId,
    restaurantName: restaurants.name,
    spunBy: spinHistory.spunBy,
    spunByName: users.name,
    spunAt: spinHistory.spunAt
  }).from(spinHistory).innerJoin(restaurants, eq(spinHistory.restaurantId, restaurants.id)).innerJoin(users, eq(spinHistory.spunBy, users.id)).where(eq(spinHistory.wheelId, wheelId)).orderBy(desc(spinHistory.id)).limit(1);
  return rows[0] ?? null;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri2 = atob(state);
    return redirectUri2;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/googleAuth.ts
import { parse as parseCookie } from "cookie";
import { decodeJwt } from "jose";
import { generateCodeVerifier, generateState, Google } from "arctic";

// shared/googleProfile.ts
var VALID_ISS = /* @__PURE__ */ new Set(["https://accounts.google.com", "accounts.google.com"]);
function mapGoogleClaims(claims, expectedAud, nowSeconds) {
  const { iss, aud, exp, sub, email_verified: emailVerified } = claims;
  if (typeof iss !== "string" || !VALID_ISS.has(iss)) {
    throw new Error("Invalid token issuer");
  }
  const audOk = aud === expectedAud || Array.isArray(aud) && aud.includes(expectedAud);
  if (!expectedAud || !audOk) {
    throw new Error("Token audience mismatch");
  }
  if (typeof exp !== "number" || exp <= nowSeconds) {
    throw new Error("Token expired");
  }
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Token missing subject");
  }
  if (emailVerified !== true) {
    throw new Error("Email not verified");
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
  return { openId: `google:${sub}`, email, name: rawName || null };
}

// server/googleAuth.ts
var SCOPES = ["openid", "profile", "email"];
var STATE_COOKIE = "g_oauth_state";
var VERIFIER_COOKIE = "g_oauth_verifier";
var TEMP_MAX_AGE_MS = 10 * 60 * 1e3;
var isConfigured = () => Boolean(ENV.googleClientId && ENV.googleClientSecret);
function notReady(res) {
  if (!isConfigured()) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return true;
  }
  if (ENV.isProduction && !ENV.appOrigin) {
    res.status(503).json({ error: "APP_ORIGIN must be set in production" });
    return true;
  }
  return false;
}
var stripSlash = (s) => s.replace(/\/$/, "");
function isSecureRequest2(req) {
  if (req.protocol === "https") return true;
  const fwd = req.headers["x-forwarded-proto"];
  const list = Array.isArray(fwd) ? fwd : (fwd ?? "").split(",");
  return list.some((p) => p.trim().toLowerCase() === "https");
}
function requestOrigin(req) {
  const proto = isSecureRequest2(req) ? "https" : "http";
  const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
  return stripSlash(`${proto}://${host}`);
}
function redirectUri(req) {
  const origin = ENV.appOrigin || `${req.protocol}://${req.get("host")}`;
  return `${stripSlash(origin)}/api/auth/google/callback`;
}
var googleClient = (req) => new Google(ENV.googleClientId, ENV.googleClientSecret, redirectUri(req));
function clearTempCookies(res) {
  res.clearCookie(STATE_COOKIE, { path: "/" });
  res.clearCookie(VERIFIER_COOKIE, { path: "/" });
}
function registerGoogleAuthRoutes(app2) {
  app2.get("/api/auth/google/login", (req, res) => {
    if (notReady(res)) return;
    if (ENV.appOrigin && requestOrigin(req) !== stripSlash(ENV.appOrigin)) {
      res.redirect(302, `${stripSlash(ENV.appOrigin)}/api/auth/google/login`);
      return;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleClient(req).createAuthorizationURL(state, codeVerifier, SCOPES);
    const secure = getSessionCookieOptions(req).secure;
    const tempOpts = { httpOnly: true, path: "/", maxAge: TEMP_MAX_AGE_MS, sameSite: "lax", secure };
    res.cookie(STATE_COOKIE, state, tempOpts);
    res.cookie(VERIFIER_COOKIE, codeVerifier, tempOpts);
    res.redirect(302, url.toString());
  });
  app2.get("/api/auth/google/callback", async (req, res) => {
    if (notReady(res)) return;
    const code = req.query.code;
    const stateParam = req.query.state;
    const cookies = parseCookie(req.headers.cookie ?? "");
    const storedState = cookies[STATE_COOKIE];
    const codeVerifier = cookies[VERIFIER_COOKIE];
    if (typeof code !== "string" || typeof stateParam !== "string" || !storedState || !codeVerifier || stateParam !== storedState) {
      console.error("[GoogleAuth] state check failed:", {
        hasCode: typeof code === "string",
        hasStateParam: typeof stateParam === "string",
        hasStoredState: Boolean(storedState),
        hasVerifier: Boolean(codeVerifier),
        stateMatches: stateParam === storedState,
        origin: requestOrigin(req),
        appOrigin: ENV.appOrigin
      });
      clearTempCookies(res);
      res.status(400).json({ error: "Invalid OAuth state" });
      return;
    }
    try {
      const tokens = await googleClient(req).validateAuthorizationCode(code, codeVerifier);
      const claims = decodeJwt(tokens.idToken());
      const user = mapGoogleClaims(claims, ENV.googleClientId, Math.floor(Date.now() / 1e3));
      await upsertUser({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "google",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      clearTempCookies(res);
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      clearTempCookies(res);
      console.error("[GoogleAuth] callback failed:", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "Sign-in failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { nanoid } from "nanoid";
import { z as z3 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson,
  sse: {
    enabled: true,
    ping: { enabled: true, intervalMs: 2e4 }
  }
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// shared/smartPick.ts
var MOOD_STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "some",
  "something",
  "anything",
  "want",
  "wanna",
  "with",
  "for",
  "and",
  "or",
  "im",
  "feeling",
  "feel",
  "like",
  "food",
  "lunch",
  "eat",
  "please",
  "really",
  "very",
  "kinda",
  "bit",
  "today",
  "now",
  "to",
  "of",
  "in"
]);
var MOOD_BOOST_FACTOR = 3;
var RECENCY_REASON_DAYS = 5;
function moodKeywords(input) {
  const out = [];
  const push2 = (raw) => {
    const k = raw.trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  };
  for (const c of input.chips ?? []) push2(c);
  for (const tok of (input.text ?? "").toLowerCase().split(/[^a-z]+/)) {
    if (tok.length >= 3 && !MOOD_STOPWORDS.has(tok)) push2(tok);
  }
  return out;
}
function matchedMoodKeyword(c, keywords) {
  const haystay = [c.name, c.cuisine ?? "", ...c.tags].join(" ").toLowerCase();
  for (const k of keywords) {
    if (haystay.includes(k)) return k;
  }
  return null;
}
function moodBoost(candidates, keywords, factor = MOOD_BOOST_FACTOR) {
  const m = /* @__PURE__ */ new Map();
  for (const c of candidates) {
    m.set(c.id, keywords.length > 0 && matchedMoodKeyword(c, keywords) ? factor : 1);
  }
  return m;
}
function applyMoodBoost(base, boost) {
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * (boost.get(w.restaurantId) ?? 1)
  }));
}
var cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function explainPick(ctx) {
  const { chosen } = ctx;
  const threshold = ctx.recencyDays ?? RECENCY_REASON_DAYS;
  const kw = matchedMoodKeyword(chosen, ctx.moodKeywords);
  if (kw) return `${cap(kw)} \u2014 just like you asked.`;
  if (chosen.daysSinceLastPick == null) {
    return "A fresh face \u2014 you've never spun this one.";
  }
  if (chosen.daysSinceLastPick >= threshold) {
    const unit = chosen.daysSinceLastPick === 1 ? "day" : "days";
    return `You haven't had ${chosen.name} in ${chosen.daysSinceLastPick} ${unit}.`;
  }
  if (chosen.cuisine) {
    return `Feeling ${chosen.cuisine}? The wheel says yes.`;
  }
  if (ctx.totalCandidates > 1) {
    return `Narrowed ${ctx.totalCandidates} options down to this one.`;
  }
  return "The wheel landed on a good one.";
}

// shared/parseAddList.ts
var MAX_NAME_LENGTH = 128;
var MAX_ITEMS = 50;
var LEADING_VERB = /^(?:add|include|put|also|maybe)\s+/i;
var LEADING_ARTICLE = /^(?:the|a|an|some)\s+/i;
function parseAddList(text2) {
  const rawTokens = text2.split(/[\n,;]|\s+\band\b\s+/i);
  const seen = /* @__PURE__ */ new Set();
  const names = [];
  for (let token of rawTokens) {
    token = token.trim().replace(/^[•*\-]\s+/, "");
    token = token.replace(/^["'`]+|["'`.!]+$/g, "").trim();
    const verb = token.match(LEADING_VERB);
    if (verb) token = token.slice(verb[0].length).replace(LEADING_ARTICLE, "").trim();
    if (!token) continue;
    if (token.length > MAX_NAME_LENGTH) token = token.slice(0, MAX_NAME_LENGTH).trim();
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(token);
    if (names.length >= MAX_ITEMS) break;
  }
  return names;
}
var CUISINE_KEYWORDS = [
  ["Japanese", ["ramen", "sushi", "izakaya", "udon", "tempura", "japanese", "sashimi", "donburi", "teriyaki"]],
  ["Mexican", ["taco", "burrito", "taqueria", "mexican", "quesadilla", "nachos", "cantina"]],
  ["Italian", ["pizza", "pizzeria", "pasta", "italian", "trattoria", "risotto", "osteria"]],
  ["Chinese", ["dim sum", "dumpling", "chinese", "szechuan", "sichuan", "wok", "noodle house"]],
  ["Thai", ["thai", "pad thai", "tom yum"]],
  ["Indian", ["curry", "indian", "tandoor", "masala", "biryani", "naan"]],
  ["Vietnamese", ["pho", "banh mi", "vietnamese"]],
  ["Korean", ["korean", "bibimbap", "kimchi", "gochujang", "bulgogi"]],
  ["American", ["burger", "diner", "grill", "american", "bbq", "steakhouse", "deli", "wings"]],
  ["Mediterranean", ["kebab", "shawarma", "falafel", "gyro", "mediterranean", "greek", "hummus"]]
];
function guessCuisine(name) {
  const n = name.toLowerCase();
  for (const [label, keywords] of CUISINE_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return label;
  }
  return null;
}
function resolveAddList(text2, existingTags) {
  const cuisineTags = existingTags.filter((t2) => t2.category == null || t2.category === "cuisine");
  const byName = new Map(cuisineTags.map((t2) => [t2.name.toLowerCase(), t2]));
  return parseAddList(text2).map((name) => {
    const guess = guessCuisine(name);
    const tag = guess ? byName.get(guess.toLowerCase()) ?? null : null;
    return {
      name,
      cuisineTagId: tag?.id ?? null,
      cuisineTagName: tag?.name ?? null
    };
  });
}

// shared/import.ts
var MAX_NAME_LENGTH2 = 128;
function parseRestaurantList(raw, existing = []) {
  const seen = new Set(existing.map((n) => n.trim().toLowerCase()));
  const names = [];
  let tooLong = 0;
  let duplicates = 0;
  for (const token of raw.split(/[\n,]/)) {
    const name = token.trim();
    if (!name) continue;
    if (name.length > MAX_NAME_LENGTH2) {
      tooLong++;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return { names, skipped: { tooLong, duplicates } };
}

// shared/transfer.ts
import { z as z2 } from "zod";
var WHEEL_EXPORT_VERSION = 1;
var wheelExportSchema = z2.object({
  version: z2.literal(WHEEL_EXPORT_VERSION).default(WHEEL_EXPORT_VERSION),
  name: z2.string().min(1).max(128),
  exclusionDays: z2.number().int().min(0).max(30).default(3),
  fairnessMode: z2.boolean().default(false),
  rotateCuisines: z2.boolean().default(false),
  restaurants: z2.array(
    z2.object({
      name: z2.string().min(1).max(128),
      notes: z2.string().max(500).nullable().default(null),
      tags: z2.array(
        z2.object({
          name: z2.string().min(1).max(64),
          category: z2.enum(["cuisine", "food_type", "custom"])
        })
      ).default([])
    })
  ).default([])
});
function serializeWheel(wheel, restaurants2) {
  return {
    version: WHEEL_EXPORT_VERSION,
    name: wheel.name,
    exclusionDays: wheel.exclusionDays,
    fairnessMode: wheel.fairnessMode,
    rotateCuisines: wheel.rotateCuisines,
    restaurants: restaurants2.map((r) => ({
      name: r.name,
      notes: r.notes,
      tags: r.tags.map((t2) => ({ name: t2.name, category: t2.category }))
    }))
  };
}

// shared/pick.ts
function pickWinner(candidateIds, rng = Math.random) {
  if (candidateIds.length === 0) throw new Error("pickWinner requires at least one candidate");
  const idx = Math.min(candidateIds.length - 1, Math.floor(rng() * candidateIds.length));
  return candidateIds[idx];
}

// shared/weight.ts
var WEIGHT_CAP_DAYS = 30;
function computeWeights(items, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  return items.map((it) => {
    if (!it.lastPickedAt) {
      return { restaurantId: it.restaurantId, weight: 1 + WEIGHT_CAP_DAYS };
    }
    const days = (now.getTime() - it.lastPickedAt.getTime()) / 864e5;
    const clamped = Math.max(0, Math.min(WEIGHT_CAP_DAYS, days));
    return { restaurantId: it.restaurantId, weight: 1 + clamped };
  });
}
var CUISINE_FACTOR_MIN = 0.25;
var CUISINE_FACTOR_MAX = 3;
var CUISINE_NEUTRAL_DAYS = 3;
function cuisineFactor(cuisineId, lastPicked, now) {
  if (cuisineId == null) return 1;
  const last = lastPicked.get(cuisineId);
  if (!last) return CUISINE_FACTOR_MAX;
  const days = (now.getTime() - last.getTime()) / 864e5;
  return Math.max(CUISINE_FACTOR_MIN, Math.min(CUISINE_FACTOR_MAX, days / CUISINE_NEUTRAL_DAYS));
}
function applyCuisineRotation(base, items, cuisineLastPicked, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const cuisineOf = new Map(items.map((i) => [i.restaurantId, i.cuisineId]));
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * cuisineFactor(cuisineOf.get(w.restaurantId) ?? null, cuisineLastPicked, now)
  }));
}
function pickWeighted(weights, rng = Math.random) {
  if (weights.length === 0) throw new Error("pickWeighted requires at least one candidate");
  const total = weights.reduce((sum, w) => sum + Math.max(0, w.weight), 0);
  if (total <= 0) {
    return weights[Math.min(weights.length - 1, Math.floor(rng() * weights.length))].restaurantId;
  }
  let threshold = rng() * total;
  for (const w of weights) {
    threshold -= Math.max(0, w.weight);
    if (threshold < 0) return w.restaurantId;
  }
  return weights[weights.length - 1].restaurantId;
}

// shared/session.ts
function vetoedIds(state) {
  return state.vetoes.filter((m) => m.userIds.length > 0).map((m) => m.restaurantId);
}
function voteCounts(state) {
  return new Map(state.votes.filter((m) => m.userIds.length > 0).map((m) => [m.restaurantId, m.userIds.length]));
}
function excludedDietaryTagIds(state) {
  const set = /* @__PURE__ */ new Set();
  for (const m of state.dietary) for (const t2 of m.tagIds) set.add(t2);
  return Array.from(set);
}
var VOTE_WEIGHT = 3;
function applyVoteWeights(base, votes, voteWeight = VOTE_WEIGHT) {
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight + (votes.get(w.restaurantId) ?? 0) * voteWeight
  }));
}

// shared/realtimeState.ts
function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
function buildSessionState(rows) {
  const vetoes = /* @__PURE__ */ new Map();
  const votes = /* @__PURE__ */ new Map();
  const dietary = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.kind === "veto") push(vetoes, r.refId, r.userId);
    else if (r.kind === "vote") push(votes, r.refId, r.userId);
    else push(dietary, r.userId, r.refId);
  }
  return {
    vetoes: Array.from(vetoes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    votes: Array.from(votes, ([restaurantId, userIds]) => ({ restaurantId, userIds })),
    dietary: Array.from(dietary, ([userId, tagIds]) => ({ userId, tagIds }))
  };
}
function activePresence(rows, nowMs, ttlMs) {
  const cutoff = nowMs - ttlMs;
  return rows.filter((r) => new Date(r.lastSeen).getTime() >= cutoff).map((r) => ({ userId: r.userId, name: r.name }));
}

// server/routers.ts
var PRESENCE_TTL_MS = 25e3;
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // ─── Wheels ─────────────────────────────────────────────────────────────────
  wheels: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserWheels(ctx.user.id);
    }),
    get: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.id);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.id, ctx.user.id);
      if (!isMember && !wheel.isPublic) throw new TRPCError3({ code: "FORBIDDEN" });
      const members = await getWheelMembers(input.id);
      const owner = await getUserById(wheel.ownerId);
      return { ...wheel, members, owner };
    }),
    create: protectedProcedure.input(z3.object({
      name: z3.string().min(1).max(128),
      isShared: z3.boolean(),
      isPublic: z3.boolean(),
      exclusionDays: z3.number().int().min(0).max(30).default(3),
      fairnessMode: z3.boolean().default(false),
      rotateCuisines: z3.boolean().default(false)
    })).mutation(async ({ ctx, input }) => {
      const inviteToken = input.isShared ? nanoid(16) : void 0;
      const id = await createWheel(ctx.user.id, input.name, input.isShared, input.isPublic, inviteToken, input.exclusionDays, input.fairnessMode, input.rotateCuisines);
      return { id, inviteToken };
    }),
    update: protectedProcedure.input(z3.object({
      id: z3.number(),
      name: z3.string().min(1).max(128).optional(),
      isPublic: z3.boolean().optional(),
      exclusionDays: z3.number().int().min(0).max(30).optional(),
      fairnessMode: z3.boolean().optional(),
      rotateCuisines: z3.boolean().optional()
    })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.id);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      if (wheel.ownerId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN" });
      await updateWheel(input.id, { name: input.name, isPublic: input.isPublic, exclusionDays: input.exclusionDays, fairnessMode: input.fairnessMode, rotateCuisines: input.rotateCuisines });
      return { success: true };
    }),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.id);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      if (wheel.ownerId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN" });
      await deleteWheel(input.id);
      return { success: true };
    }),
    regenerateInvite: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.id);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      if (wheel.ownerId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN" });
      const inviteToken = nanoid(16);
      await updateWheel(input.id, { inviteToken });
      return { inviteToken };
    }),
    join: protectedProcedure.input(z3.object({ token: z3.string() })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelByInviteToken(input.token);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND", message: "Invalid invite link" });
      if (!wheel.isShared) throw new TRPCError3({ code: "FORBIDDEN", message: "This wheel is not shared" });
      await addWheelMember(wheel.id, ctx.user.id);
      return { wheelId: wheel.id, wheelName: wheel.name };
    }),
    // Portable JSON bundle of a wheel + its restaurants (no ids).
    export: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.id);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.id, ctx.user.id);
      if (!isMember && !wheel.isPublic) throw new TRPCError3({ code: "FORBIDDEN" });
      const rests = await getRestaurantsByWheel(input.id);
      return serializeWheel(wheel, rests);
    }),
    // Create a fresh wheel for the caller from an export bundle.
    import: protectedProcedure.input(wheelExportSchema).mutation(async ({ ctx, input }) => {
      const id = await importWheelData(ctx.user.id, input);
      return { id };
    })
  }),
  // ─── Tags ────────────────────────────────────────────────────────────────────
  tags: router({
    list: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember && !wheel.isPublic) throw new TRPCError3({ code: "FORBIDDEN" });
      return getTagsForWheel(input.wheelId);
    }),
    createCustom: protectedProcedure.input(z3.object({ name: z3.string().min(1).max(64), wheelId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const id = await createCustomTag(input.name, ctx.user.id, input.wheelId);
      return { id };
    })
  }),
  // ─── Restaurants ─────────────────────────────────────────────────────────────
  restaurants: router({
    list: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember && !wheel.isPublic) throw new TRPCError3({ code: "FORBIDDEN" });
      const rests = await getRestaurantsByWheel(input.wheelId);
      const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
      return rests.map((r) => ({
        ...r,
        isExcluded: exclusions.has(r.id),
        excludedUntil: exclusions.get(r.id) ?? null
      }));
    }),
    add: protectedProcedure.input(z3.object({ wheelId: z3.number(), name: z3.string().min(1).max(128), notes: z3.string().max(500).nullable(), tagIds: z3.array(z3.number()), mapUrl: z3.string().max(512).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const id = await addRestaurant(input.wheelId, ctx.user.id, input.name, input.notes, input.tagIds, input.mapUrl ?? null);
      return { id };
    }),
    addBulk: protectedProcedure.input(z3.object({ wheelId: z3.number(), text: z3.string().max(1e4) })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const existing = await getRestaurantsByWheel(input.wheelId);
      const { names, skipped } = parseRestaurantList(input.text, existing.map((r) => r.name));
      const added = await addRestaurants(input.wheelId, ctx.user.id, names);
      return { added, skipped };
    }),
    update: protectedProcedure.input(z3.object({ id: z3.number(), name: z3.string().min(1).max(128), notes: z3.string().max(500).nullable(), tagIds: z3.array(z3.number()), mapUrl: z3.string().max(512).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const restaurant = await getRestaurantById(input.id);
      if (!restaurant) throw new TRPCError3({ code: "NOT_FOUND" });
      const wheel = await getWheelById(restaurant.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      if (wheel.ownerId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "Only the wheel creator can edit restaurants" });
      await updateRestaurant(input.id, input.name, input.notes, input.tagIds, input.mapUrl ?? null);
      return { success: true };
    }),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ ctx, input }) => {
      const restaurant = await getRestaurantById(input.id);
      if (!restaurant) throw new TRPCError3({ code: "NOT_FOUND" });
      const wheel = await getWheelById(restaurant.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      if (wheel.ownerId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "Only the wheel creator can delete restaurants" });
      await deleteRestaurant(input.id);
      return { success: true };
    })
  }),
  // ─── Spins ───────────────────────────────────────────────────────────────────
  spins: router({
    // Server-authoritative spin: the server picks the winner among the eligible
    // restaurants and records it, so a shared wheel can't be tampered with from
    // the client. The candidate ids are the restaurants currently on the
    // caller's wheel (after their tag filter); the server re-validates them
    // against the wheel and the live exclusion window before choosing.
    create: protectedProcedure.input(z3.object({ wheelId: z3.number(), candidateIds: z3.array(z3.number()).min(1) })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const rests = await getRestaurantsByWheel(input.wheelId);
      const valid = new Set(rests.map((r) => r.id));
      const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
      const session = buildSessionState(await getRoundMarks(input.wheelId));
      const vetoed = new Set(vetoedIds(session));
      const avoidedTags = new Set(excludedDietaryTagIds(session));
      const dietaryBlocked = new Set(
        avoidedTags.size === 0 ? [] : rests.filter((r) => r.tags.some((t2) => avoidedTags.has(t2.id))).map((r) => r.id)
      );
      const eligible = input.candidateIds.filter(
        (id2) => valid.has(id2) && !exclusions.has(id2) && !vetoed.has(id2) && !dietaryBlocked.has(id2)
      );
      if (eligible.length === 0) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "No eligible restaurants to spin" });
      }
      const votes = voteCounts(session);
      const hasVotes = votes.size > 0;
      let restaurantId;
      if (wheel.fairnessMode || wheel.rotateCuisines || hasVotes) {
        let base;
        if (wheel.fairnessMode) {
          const stats = await getRestaurantStats(input.wheelId);
          const lastPicked = new Map(stats.map((s) => [s.id, s.lastPickedAt]));
          base = computeWeights(eligible.map((id2) => ({ restaurantId: id2, lastPickedAt: lastPicked.get(id2) ?? null })));
        } else {
          base = eligible.map((id2) => ({ restaurantId: id2, weight: 1 }));
        }
        if (wheel.rotateCuisines) {
          const cuisineOf = new Map(rests.map((r) => [r.id, r.tags.find((t2) => t2.category === "cuisine")?.id ?? null]));
          const history = await getSpinHistory(input.wheelId);
          const cuisineLastPicked = /* @__PURE__ */ new Map();
          for (const h of history) {
            const c = cuisineOf.get(h.restaurantId);
            if (c == null) continue;
            const at = new Date(h.spunAt);
            const cur = cuisineLastPicked.get(c);
            if (!cur || at > cur) cuisineLastPicked.set(c, at);
          }
          base = applyCuisineRotation(
            base,
            eligible.map((id2) => ({ restaurantId: id2, cuisineId: cuisineOf.get(id2) ?? null })),
            cuisineLastPicked
          );
        }
        restaurantId = pickWeighted(applyVoteWeights(base, votes));
      } else {
        restaurantId = pickWinner(eligible);
      }
      const id = await recordSpin(input.wheelId, restaurantId, ctx.user.id);
      await clearRoundVotes(input.wheelId);
      return { id, restaurantId };
    }),
    // Most recent spin on a wheel — clients poll this to surface "someone spun"
    // on shared wheels (replaces the old SSE broadcast).
    latest: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      return getLatestSpin(input.wheelId);
    }),
    record: protectedProcedure.input(z3.object({ wheelId: z3.number(), restaurantId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const id = await recordSpin(input.wheelId, input.restaurantId, ctx.user.id);
      return { id };
    }),
    history: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      return getSpinHistory(input.wheelId);
    }),
    reenable: protectedProcedure.input(z3.object({ wheelId: z3.number(), restaurantId: z3.number() })).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await reenableRestaurant(input.wheelId, input.restaurantId, wheel.exclusionDays);
      return { success: true };
    })
  }),
  // ─── Presence ────────────────────────────────────────────────────────────────
  presence: router({
    // "Who's here right now" for a shared wheel. Joining/leaving is driven by the
    // lifetime of this SSE subscription; the server ref-counts connections so a
    // user with multiple tabs shows once and disappears only when all close.
    // Heartbeat + roster in one call: the client polls this (~10s); a user is
    // "online" while their last ping is within the TTL. Multiple tabs collapse
    // to one row (keyed by user), and stale rows simply age out.
    ping: protectedProcedure.input(z3.object({ wheelId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await pingPresence(input.wheelId, ctx.user.id, ctx.user.name);
      const now = Date.now();
      const rows = await getActivePresence(input.wheelId, new Date(now - PRESENCE_TTL_MS));
      return activePresence(rows, now, PRESENCE_TTL_MS);
    })
  }),
  // ─── Session (vetoes & votes) ─────────────────────────────────────────────────
  session: router({
    // Current round's veto/vote/dietary state — clients poll this (~3s).
    state: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      return buildSessionState(await getRoundMarks(input.wheelId));
    }),
    veto: protectedProcedure.input(z3.object({ wheelId: z3.number(), restaurantId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await toggleRoundMark(input.wheelId, "veto", input.restaurantId, ctx.user.id);
      return { success: true };
    }),
    vote: protectedProcedure.input(z3.object({ wheelId: z3.number(), restaurantId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await toggleRoundMark(input.wheelId, "vote", input.restaurantId, ctx.user.id);
      return { success: true };
    }),
    dietary: protectedProcedure.input(z3.object({ wheelId: z3.number(), tagId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await toggleRoundMark(input.wheelId, "dietary", input.tagId, ctx.user.id);
      return { success: true };
    }),
    clear: protectedProcedure.input(z3.object({ wheelId: z3.number() })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      await clearRoundAll(input.wheelId);
      return { success: true };
    })
  }),
  // ─── Statistics ─────────────────────────────────────────────────────────────
  stats: router({
    getRestaurantStats: protectedProcedure.input(z3.object({ wheelId: z3.number() })).query(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      return getRestaurantStats(input.wheelId);
    })
  }),
  // ─── Smart Pick (free, no LLM) ──────────────────────────────────────────────
  smart: router({
    // "Decide for me" — a free heuristic. Same eligibility + weighting as a real
    // spin (fairness/rotation/votes), plus an optional mood boost, then a short
    // truthful reason. Server-authoritative: it picks, records, and broadcasts
    // exactly like spins.create — the client never gets to choose the winner.
    pick: protectedProcedure.input(
      z3.object({
        wheelId: z3.number(),
        candidateIds: z3.array(z3.number()).min(1),
        moodChips: z3.array(z3.string().max(40)).max(8).optional(),
        moodText: z3.string().max(200).optional()
      })
    ).mutation(async ({ ctx, input }) => {
      const wheel = await getWheelById(input.wheelId);
      if (!wheel) throw new TRPCError3({ code: "NOT_FOUND" });
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const rests = await getRestaurantsByWheel(input.wheelId);
      const byId = new Map(rests.map((r) => [r.id, r]));
      const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
      const session = buildSessionState(await getRoundMarks(input.wheelId));
      const vetoed = new Set(vetoedIds(session));
      const avoidedTags = new Set(excludedDietaryTagIds(session));
      const dietaryBlocked = new Set(
        avoidedTags.size === 0 ? [] : rests.filter((r) => r.tags.some((t2) => avoidedTags.has(t2.id))).map((r) => r.id)
      );
      const eligibleIds = input.candidateIds.filter(
        (id) => byId.has(id) && !exclusions.has(id) && !vetoed.has(id) && !dietaryBlocked.has(id)
      );
      if (eligibleIds.length === 0) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "No eligible restaurants to pick from" });
      }
      const stats = await getRestaurantStats(input.wheelId);
      const lastPicked = new Map(stats.map((s) => [s.id, s.lastPickedAt]));
      const now = Date.now();
      const daysSince = (id) => {
        const raw = lastPicked.get(id);
        const t2 = raw ? new Date(raw).getTime() : NaN;
        return Number.isNaN(t2) ? null : Math.floor((now - t2) / 864e5);
      };
      const candidates = eligibleIds.map((id) => {
        const r = byId.get(id);
        return {
          id,
          name: r.name,
          tags: r.tags.map((t2) => t2.name),
          cuisine: r.tags.find((t2) => t2.category === "cuisine")?.name ?? null,
          daysSinceLastPick: daysSince(id)
        };
      });
      let base;
      if (wheel.fairnessMode) {
        base = computeWeights(
          eligibleIds.map((id) => ({ restaurantId: id, lastPickedAt: lastPicked.get(id) ?? null }))
        );
      } else {
        base = eligibleIds.map((id) => ({ restaurantId: id, weight: 1 }));
      }
      if (wheel.rotateCuisines) {
        const cuisineOf = new Map(rests.map((r) => [r.id, r.tags.find((t2) => t2.category === "cuisine")?.id ?? null]));
        const history = await getSpinHistory(input.wheelId);
        const cuisineLastPicked = /* @__PURE__ */ new Map();
        for (const h of history) {
          const cId = cuisineOf.get(h.restaurantId);
          if (cId == null) continue;
          const at = new Date(h.spunAt);
          const cur = cuisineLastPicked.get(cId);
          if (!cur || at > cur) cuisineLastPicked.set(cId, at);
        }
        base = applyCuisineRotation(
          base,
          eligibleIds.map((id) => ({ restaurantId: id, cuisineId: cuisineOf.get(id) ?? null })),
          cuisineLastPicked
        );
      }
      base = applyVoteWeights(base, voteCounts(session));
      const keywords = moodKeywords({ chips: input.moodChips, text: input.moodText });
      base = applyMoodBoost(base, moodBoost(candidates, keywords));
      const restaurantId = pickWeighted(base);
      const chosen = candidates.find((c) => c.id === restaurantId);
      const reason = explainPick({ chosen, moodKeywords: keywords, totalCandidates: eligibleIds.length });
      await recordSpin(input.wheelId, restaurantId, ctx.user.id);
      await clearRoundVotes(input.wheelId);
      return { restaurantId, name: chosen.name, reason };
    }),
    // "Smart add" — parse a loose blob into clean names + a best-effort cuisine
    // mapped ONLY to existing wheel tags. Read-only: returns a proposal the
    // client confirms; the actual writes go through restaurants.add/addBulk.
    parseAdd: protectedProcedure.input(z3.object({ wheelId: z3.number(), text: z3.string().min(1).max(4e3) })).mutation(async ({ ctx, input }) => {
      const isMember = await isWheelMember(input.wheelId, ctx.user.id);
      if (!isMember) throw new TRPCError3({ code: "FORBIDDEN" });
      const tags2 = await getTagsForWheel(input.wheelId);
      const proposals = resolveAddList(
        input.text,
        tags2.map((t2) => ({ id: t2.id, name: t2.name, category: t2.category }))
      );
      return { proposals };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/app.ts
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  app2.get(["/healthz", "/api/healthz"], (_req, res) => res.status(200).json({ ok: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  registerGoogleAuthRoutes(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  app2.use(
    (req, res) => res.status(404).json({ error: "Not found", path: req.url, originalUrl: req.originalUrl })
  );
  return app2;
}

// server/_core/vercelHandler.ts
var app = createApp();
function handler(req, res) {
  const url = req.url ?? "/";
  if (!url.startsWith("/api")) {
    req.url = "/api" + (url.startsWith("/") ? url : "/" + url);
  }
  return app(req, res);
}
export {
  handler as default
};
