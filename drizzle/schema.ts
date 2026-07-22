import {
  boolean,
  decimal,
  index,
  int,
  json,
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
  // Wheel auto-opened on entry when set; null = fall back to the first wheel.
  defaultWheelId: int("defaultWheelId"),
  // High-water mark for the notification bell: notifications created after this
  // are "unread" (light the red dot). Opening the panel advances it to now.
  lastReadNotificationAt: timestamp("lastReadNotificationAt"),
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
  // Distance mode: one shared origin ("Office / meeting point" on shared
  // wheels), off by default and fully optional. Walking time to each
  // restaurant is computed from this point, not per-member.
  distanceEnabled: boolean("distanceEnabled").default(false).notNull(),
  originLat: decimal("originLat", { precision: 9, scale: 6 }),
  originLng: decimal("originLng", { precision: 9, scale: 6 }),
  originLabel: varchar("originLabel", { length: 64 }).default("Office"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // getWheelList reads owned wheels by ownerId; join-by-invite looks up inviteToken.
  ownerIdx: index("wheels_owner_idx").on(t.ownerId),
  inviteTokenIdx: index("wheels_invite_token_idx").on(t.inviteToken),
}));

export type Wheel = typeof wheels.$inferSelect;
export type InsertWheel = typeof wheels.$inferInsert;

// ─── Wheel Members (for shared wheels) ────────────────────────────────────────

export const wheelMembers = mysqlTable("wheel_members", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (t) => ({
  // isWheelMember (WHERE wheelId AND userId) runs on every shared-wheel poll;
  // getWheelList reads a user's memberships (WHERE userId).
  wheelUserIdx: index("wheel_members_wheel_user_idx").on(t.wheelId, t.userId),
  userIdx: index("wheel_members_user_idx").on(t.userId),
}));

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
}, (t) => ({
  // getTagsForWheel filters by wheelId (plus the null/global set).
  wheelIdx: index("tags_wheel_idx").on(t.wheelId),
}));

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

// ─── Restaurants ──────────────────────────────────────────────────────────────

export const restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  notes: text("notes"),
  mapUrl: varchar("mapUrl", { length: 512 }), // optional Google Maps link for DIRECTIONS
  addedBy: int("addedBy").notNull(),
  primaryTagId: int("primaryTagId"), // determines wheel segment color
  // ── Located-place fields (P0 "located wheel"). placeId null + source="user"
  //    preserves the original user-typed restaurant as a subtype. ──
  placeId: varchar("placeId", { length: 256 }), // provider place id; null = user-typed
  lat: decimal("lat", { precision: 9, scale: 6 }),
  lng: decimal("lng", { precision: 9, scale: 6 }),
  address: varchar("address", { length: 512 }),
  priceLevel: int("priceLevel"), // 1..4 (nullable)
  cuisine: varchar("cuisine", { length: 64 }),
  openHours: json("openHours"), // raw provider hours; open-now is a hint, not a hard filter
  source: mysqlEnum("source", ["provider", "user"]).default("user").notNull(),
  // Walking seconds from the wheel's distance-mode origin (shared/wheelDistance.ts,
  // server/distance.ts); null = distance mode is off, not yet computed, or this
  // restaurant has no resolvable location. Same value for every member — the
  // origin is per-wheel, not per-user.
  walkSeconds: int("walkSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // restaurants.list / stats / distance all scope by wheelId.
  wheelIdx: index("restaurants_wheel_idx").on(t.wheelId),
}));

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = typeof restaurants.$inferInsert;

// ─── Restaurant ↔ Tag join ────────────────────────────────────────────────────

export const restaurantTags = mysqlTable("restaurant_tags", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  tagId: int("tagId").notNull(),
}, (t) => ({
  // The tag join loads all tags for a wheel's restaurants (WHERE restaurantId IN …);
  // tag filtering looks up rows by tagId.
  restaurantIdx: index("restaurant_tags_restaurant_idx").on(t.restaurantId),
  tagIdx: index("restaurant_tags_tag_idx").on(t.tagId),
}));

export type RestaurantTag = typeof restaurantTags.$inferSelect;

// ─── Restaurant ratings ───────────────────────────────────────────────────────
// A 1–5 star verdict per member per place (shared/restaurantRating.ts). One
// upsert-able row per (restaurant, user); a place's team rating is the average.
// Supersedes the old per-spin loved/ok/never enum on spin_history. The composite
// PK is restaurantId-first, so per-restaurant aggregate reads use it directly.
export const restaurantRatings = mysqlTable("restaurant_ratings", {
  restaurantId: int("restaurantId").notNull(),
  userId: int("userId").notNull(),
  stars: int("stars").notNull(), // 1..5, enforced in shared/restaurantRating.ts
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.restaurantId, t.userId] }) }));

export type RestaurantRating = typeof restaurantRatings.$inferSelect;

// ─── Spin History ─────────────────────────────────────────────────────────────

export const spinHistory = mysqlTable("spin_history", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  spunBy: int("spunBy").notNull(),
  spunAt: timestamp("spunAt").defaultNow().notNull(),
  // If true, user manually re-enabled this restaurant before 3-day window expires
  manuallyReenabled: boolean("manuallyReenabled").default(false).notNull(),
  // True once someone pressed ACCEPT ("we're eating here"). Only accepted spins
  // exclude for the full window + notify the team; a rejected spin (re-spin / [x])
  // excludes only for the rest of the Taipei day (shared/exclusion.ts).
  accepted: boolean("accepted").default(false).notNull(),
  // Post-spin "how was it?" verdict; null = unrated. The latest rating per
  // restaurant biases future spins (shared/rating.ts).
  rating: mysqlEnum("rating", ["loved", "ok", "never"]),
}, (t) => ({
  // The hottest table: spins.latest (WHERE wheelId ORDER BY spunAt DESC), history,
  // and exclusion all scope by wheelId + recency; ratings look up by restaurantId.
  wheelSpunAtIdx: index("spin_history_wheel_spun_at_idx").on(t.wheelId, t.spunAt),
  restaurantIdx: index("spin_history_restaurant_idx").on(t.restaurantId),
}));

export type SpinHistory = typeof spinHistory.$inferSelect;
export type InsertSpinHistory = typeof spinHistory.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────
// One row per ACCEPT on a shared wheel, fanned out to the whole team via the
// bell. The actor (who accepted) is recorded so we never notify them of their
// own choice; read/unread is per-user via users.lastReadNotificationAt.

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  wheelId: int("wheelId").notNull(),
  spinId: int("spinId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // The bell polls notifications per wheel, newest first.
  wheelCreatedIdx: index("notifications_wheel_created_idx").on(t.wheelId, t.createdAt),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

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
