import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Wheels ───────────────────────────────────────────────────────────────────

export const wheels = mysqlTable("wheels", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wheel = typeof wheels.$inferSelect;
export type InsertWheel = typeof wheels.$inferInsert;

// ─── Wheel Members (for shared wheels) ────────────────────────────────────────

export const wheelMembers = mysqlTable("wheel_members", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type WheelMember = typeof wheelMembers.$inferSelect;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  category: mysqlEnum("category", ["cuisine", "food_type", "custom"]).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
  createdBy: int("createdBy"), // null = predefined system tag
  wheelId: int("wheelId"), // null = global/system tag; otherwise scoped to one wheel
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

// ─── Restaurants ──────────────────────────────────────────────────────────────

export const restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  notes: text("notes"),
  addedBy: int("addedBy").notNull(),
  primaryTagId: int("primaryTagId"), // determines wheel segment color
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = typeof restaurants.$inferInsert;

// ─── Restaurant ↔ Tag join ────────────────────────────────────────────────────

export const restaurantTags = mysqlTable("restaurant_tags", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  tagId: int("tagId").notNull(),
});

export type RestaurantTag = typeof restaurantTags.$inferSelect;

// ─── Spin History ─────────────────────────────────────────────────────────────

export const spinHistory = mysqlTable("spin_history", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  spunBy: int("spunBy").notNull(),
  spunAt: timestamp("spunAt").defaultNow().notNull(),
  // If true, user manually re-enabled this restaurant before 3-day window expires
  manuallyReenabled: boolean("manuallyReenabled").default(false).notNull(),
});

export type SpinHistory = typeof spinHistory.$inferSelect;
export type InsertSpinHistory = typeof spinHistory.$inferInsert;

// ─── Serverless realtime (polling-backed) ────────────────────────────────────
// Presence: a heartbeat row per (wheel, user); "online" = recent lastSeen.
export const wheelPresence = mysqlTable("wheel_presence", {
  wheelId: int("wheelId").notNull(),
  userId: int("userId").notNull(),
  name: text("name"),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.wheelId, t.userId] }) }));

// Round marks: per-wheel veto/vote (refId = restaurantId) and dietary
// (refId = tagId) selections. Replaces the old in-memory session maps.
export const roundMarks = mysqlTable("round_marks", {
  wheelId: int("wheelId").notNull(),
  kind: mysqlEnum("kind", ["veto", "vote", "dietary"]).notNull(),
  refId: int("refId").notNull(),
  userId: int("userId").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.wheelId, t.kind, t.refId, t.userId] }) }));
