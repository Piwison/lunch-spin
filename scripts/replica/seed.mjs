// Build the replica's data from nothing: run the real migrations, then seed the
// fixture the 2026-09-24 walkthrough used (docs/user-tests/2026-09-24-walkthrough.md).
//
//   node scripts/replica/seed.mjs --reset
//
// What you get (R3 in docs/plans/2026-09-24-walkthrough-plan.md):
//   - Amy (owner) and Ben (member) on a shared wheel "Lunch near Ruiguang Rd"
//     with 12 places, 10 from Google and 2 typed on the landing page, office set
//   - 15 weekdays of lunches before REPLICA_TIME: 20 spins including respins and
//     days nobody pressed "Lock it in"; 9 star ratings. Deterministic: the same
//     seed produces the same days, so plan acceptance numbers are fixed.
//   - Chloe and Dan with no wheel at all, for first-run walks (R1).
//   - Session tokens for all four in $REPLICA_STATE/tokens.json (drv.mjs reads it).
//
// --reset DROPS EVERY TABLE. It refuses to run against anything but 127.0.0.1 /
// localhost (AGENTS.md: no destructive SQL against a real DATABASE_URL).
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { SignJWT } from "jose";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICE, placeById, walkSeconds, addressOf, periods } from "./fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const STATE = process.env.REPLICA_STATE || join(HERE, ".state");
const DATABASE_URL = process.env.DATABASE_URL || "mysql://lunch:lunchpw@127.0.0.1:3306/lunch";
const JWT_SECRET = process.env.JWT_SECRET || "replica-secret";
const VITE_APP_ID = process.env.VITE_APP_ID || "lunch-replica";

const host = new URL(DATABASE_URL).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`seed: refusing to touch ${host} — the replica only runs against a local MariaDB`);
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
const q = async (sql, params) => (await conn.query(sql, params))[0];

if (process.argv.includes("--reset")) {
  const tables = await q("SHOW TABLES");
  await q("SET FOREIGN_KEY_CHECKS = 0");
  for (const row of tables) await q(`DROP TABLE \`${Object.values(row)[0]}\``);
  await q("SET FOREIGN_KEY_CHECKS = 1");
} else if ((await q("SHOW TABLES LIKE 'users'")).length && (await q("SELECT 1 FROM users LIMIT 1")).length) {
  console.error("seed: the database already has users — pass --reset to rebuild it");
  process.exit(1);
}
await migrate(drizzle(conn), { migrationsFolder: join(REPO, "drizzle") });

// ── The replica's "now" is the DB's clock (faketime), not this process's ─────
const [{ now }] = await q("SELECT UNIX_TIMESTAMP() AS now");
const TAIPEI = 8 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const todayTaipei = new Date(Math.floor((Number(now) * 1000 + TAIPEI) / DAY) * DAY); // 00:00 of today, as a UTC-dated Date
const ymd = (d) => d.toISOString().slice(0, 10);

// The 15 weekdays before today, oldest first.
const days = [];
for (let d = new Date(todayTaipei.getTime() - DAY); days.length < 15; d = new Date(d.getTime() - DAY)) {
  const wd = d.getUTCDay();
  if (wd !== 0 && wd !== 6) days.unshift(ymd(d));
}
const before = ymd(new Date(new Date(days[0]).getTime() - 2 * DAY)) + " 02:00:00";

// ── People ───────────────────────────────────────────────────────────────────
const people = [
  ["amy", "replica-amy", "Amy Chen", "amy@example.com"],
  ["ben", "replica-ben", "Ben Lin", "ben@example.com"],
  ["chloe", "replica-chloe", "Chloe Wu", "chloe@example.com"],
  ["dan", "replica-dan", "Dan Ho", "dan@example.com"],
];
const userId = {};
for (const [key, openId, name, email] of people) {
  const res = await q("INSERT INTO users (openId, name, email, loginMethod, createdAt, lastSignedIn) VALUES (?, ?, ?, 'google', ?, ?)", [openId, name, email, before, before]);
  userId[key] = res.insertId;
}

// ── The wheel ────────────────────────────────────────────────────────────────
const wheel = await q(
  `INSERT INTO wheels (name, ownerId, isShared, isPublic, inviteToken, exclusionDays, distanceEnabled, originLat, originLng, originLabel, createdAt)
   VALUES ('Lunch near Ruiguang Rd', ?, 1, 1, 'replica-invite', 3, 1, ?, ?, 'Office', ?)`,
  [userId.amy, OFFICE.lat, OFFICE.lng, before],
);
const wheelId = wheel.insertId;
await q("INSERT INTO wheel_members (wheelId, userId, joinedAt) VALUES (?, ?, ?)", [wheelId, userId.ben, before]);

// Order matters: the spin generator below indexes into this list, and changing
// it changes which place every seeded day lands on.
const menu = [
  { place: "fake_2" }, // Goose Meat Dan
  { place: "fake_3" }, // Shian Ming Tea
  { place: "fake_4" }, // Zhe Jia Fried Rice J+
  { place: "fake_7" }, // Dinghe Bento
  { place: "fake_6" }, // Song Wang Pork Knuckle
  { place: "fake_21", zhName: true }, // 首爾韓式小館 — arrived in Chinese via "Look farther"
  { typed: "鵝肉担" }, // typed on the landing page: the same shop as Goose Meat Dan (report P1-F)
  { typed: "這家炒飯" }, // typed on the landing page
  { place: "fake_14" }, // Tai Ji Hand-pulled Noodles — shuts at 12:25
  { place: "fake_9" }, // Hot Pot 106
  { place: "fake_8" }, // Bafang Dumpling Neihu
  { place: "fake_12" }, // Mo Zai Yang Lamb
];
const hasGoogleRating = (await q("SHOW COLUMNS FROM restaurants LIKE 'googleRating'")).length > 0;
const restaurantIds = [];
for (const item of menu) {
  if (item.typed) {
    const r = await q("INSERT INTO restaurants (wheelId, name, addedBy, source, createdAt) VALUES (?, ?, ?, 'user', ?)", [wheelId, item.typed, userId.amy, before]);
    restaurantIds.push(r.insertId);
    continue;
  }
  const p = placeById(item.place);
  const name = item.zhName ? p.zh : p.en;
  const lang = item.zhName ? "zh-TW" : "en";
  const row = {
    wheelId,
    name,
    addedBy: userId.amy,
    placeId: p.placeId,
    lat: p.lat.toFixed(6),
    lng: p.lng.toFixed(6),
    address: addressOf(p, lang),
    priceLevel: p.price,
    source: "provider",
    walkSeconds: walkSeconds(OFFICE, p),
    utcOffsetMinutes: 480,
    openHours: periods(p.hours) ? JSON.stringify(periods(p.hours)) : null,
    hoursUpdatedAt: periods(p.hours) ? before : null,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${p.placeId}`,
    createdAt: before,
    ...(hasGoogleRating ? { googleRating: p.rating, googleRatingCount: p.reviews } : {}),
  };
  const cols = Object.keys(row);
  const r = await q(`INSERT INTO restaurants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, Object.values(row));
  restaurantIds.push(r.insertId);
}

// ── Three weeks of lunches ───────────────────────────────────────────────────
// A fixed-seed generator so every rebuild is the same three weeks. Roughly: half
// the days are one spin then "Lock it in"; ~30% respin once or twice first; ~25%
// are one spin nobody locked in (they just went). The same Lehmer generator and
// call order as the walkthrough, so the report's numbers reproduce.
let s = 7;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const lastLocked = new Map();
const spins = [];
days.forEach((day, dayIdx) => {
  const eligible = () => menu.map((_, i) => i).filter((i) => !(lastLocked.has(i) && dayIdx - lastLocked.get(i) < 3));
  const pattern = rnd();
  const spinner = rnd() < 0.55 ? userId.amy : userId.ben;
  const minute = 45 + Math.floor(rnd() * 12); // 11:45–11:56 Taipei
  const pick = (exclude) => {
    const e = eligible().filter((i) => !exclude.includes(i));
    return e[Math.floor(rnd() * e.length)];
  };
  const at = (m, sec) => `${day} 03:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  const today = [];
  if (pattern < 0.3) {
    const respins = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < respins; k++) {
      const i = pick(today);
      today.push(i);
      spins.push([i, spinner, at(minute, 10 + k * 20), 0]);
    }
    const i = pick(today);
    spins.push([i, spinner, at(minute + 1, 5), 1]);
    lastLocked.set(i, dayIdx);
  } else if (pattern < 0.55) {
    spins.push([pick(today), spinner, at(minute, 30), 0]);
  } else {
    const i = pick(today);
    spins.push([i, spinner, at(minute, 30), 1]);
    lastLocked.set(i, dayIdx);
  }
});
for (const [i, by, at, accepted] of spins) {
  await q("INSERT INTO spin_history (wheelId, restaurantId, spunBy, spunAt, accepted) VALUES (?, ?, ?, ?, ?)", [wheelId, restaurantIds[i], by, at, accepted]);
}

const ratings = [
  ["amy", 0, 5], ["amy", 2, 4], ["amy", 4, 2], ["amy", 9, 5], ["amy", 3, 3],
  ["ben", 0, 4], ["ben", 2, 5], ["ben", 9, 4], ["ben", 8, 3],
];
for (const [who, i, stars] of ratings) {
  await q("INSERT INTO restaurant_ratings (restaurantId, userId, stars) VALUES (?, ?, ?)", [restaurantIds[i], userId[who], stars]);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
const secret = new TextEncoder().encode(JWT_SECRET);
const tokens = {};
for (const [key, openId, name] of people) {
  tokens[key] = await new SignJWT({ openId, appId: VITE_APP_ID, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Number(now)) + 30 * 86400)
    .sign(secret);
}
mkdirSync(STATE, { recursive: true });
writeFileSync(join(STATE, "tokens.json"), JSON.stringify(tokens, null, 2));

console.log(`seeded wheel ${wheelId}: ${menu.length} places, ${spins.length} spins over ${days.length} weekdays (${days[0]} → ${days.at(-1)}), ${ratings.length} ratings`);
console.log(`tokens → ${join(STATE, "tokens.json")}`);
await conn.end();
