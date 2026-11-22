#!/usr/bin/env node
/**
 * Read-only check that the newest migration is really APPLIED to a database,
 * by looking for what it creates (AGENTS.md failure modes 2 and 50: the
 * migrator's own bookkeeping cannot tell you this, the columns can).
 *
 *   read -rs DATABASE_URL && export DATABASE_URL   # paste the URL; it is not echoed
 *   node scripts/db-verify.mjs
 *
 * Only SHOW statements. Prints the host it checked, never the password.
 * When a new migration lands, add what it creates to EXPECTED.
 */
import mysql from "mysql2/promise";

/** [migration, SQL that returns >= 1 row once it is applied] */
const EXPECTED = [
  ["0018", "SHOW TABLES LIKE 'user_dietary'"],
  ["0018", "SHOW COLUMNS FROM restaurants LIKE 'googleRating'"],
  ["0018", "SHOW COLUMNS FROM restaurants LIKE 'googleRatingCount'"],
  ["0018", "SHOW COLUMNS FROM spin_history LIKE 'skipped'"],
  ["0018", "SHOW COLUMNS FROM round_marks LIKE 'createdAt'"],
];

const raw = (process.env.DATABASE_URL ?? "").trim();
if (!raw) {
  console.error("DATABASE_URL is empty. Run:  read -rs DATABASE_URL && export DATABASE_URL  then paste the URL and press Enter.");
  process.exit(2);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("DATABASE_URL is not a URL (expected mysql://user:password@host:port/database).");
  process.exit(2);
}

// The URL's own ?ssl=... options are not handed to mysql2: drizzle-kit and
// mysql2 read them differently. TiDB requires TLS, so it is set explicitly —
// except for a local database, which has none.
const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
const conn = await mysql
  .createConnection({
    host: url.hostname,
    port: Number(url.port || (local ? 3306 : 4000)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: local ? undefined : { minVersion: "TLSv1.2", rejectUnauthorized: true },
  })
  .catch((e) => {
    console.error(`Could not connect to ${url.hostname}: ${e.code ?? ""} ${e.message}`);
    process.exit(1);
  });

console.log(`Checking ${url.hostname} / ${decodeURIComponent(url.pathname.slice(1))}`);
let missing = 0;
for (const [migration, sql] of EXPECTED) {
  const [rows] = await conn.query(sql);
  const ok = rows.length > 0;
  if (!ok) missing++;
  console.log(`${ok ? "OK     " : "MISSING"} [${migration}] ${sql}`);
}
await conn.end();
console.log(missing ? `${missing} missing — the migration is NOT fully applied here.` : "All applied.");
process.exit(missing ? 1 : 0);
