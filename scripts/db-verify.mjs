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
import { describeShape, isLocalHost, parseDbUrl } from "./dbUrl.mjs";

/** [migration, SQL that returns >= 1 row once it is applied] */
const EXPECTED = [
  ["0018", "SHOW TABLES LIKE 'user_dietary'"],
  ["0018", "SHOW COLUMNS FROM restaurants LIKE 'googleRating'"],
  ["0018", "SHOW COLUMNS FROM restaurants LIKE 'googleRatingCount'"],
  ["0018", "SHOW COLUMNS FROM spin_history LIKE 'skipped'"],
  ["0018", "SHOW COLUMNS FROM round_marks LIKE 'createdAt'"],
];

const raw = process.env.DATABASE_URL ?? "";
if (!raw.trim()) {
  console.error("DATABASE_URL is empty. Run:  read -rs DATABASE_URL && export DATABASE_URL  then paste the URL and press Enter.");
  process.exit(2);
}

// Tolerates what a paste brings along (quotes, a DATABASE_URL= prefix) and a
// password with / @ # ? in it — see scripts/dbUrl.mjs.
const url = parseDbUrl(raw);
if (!url) {
  console.error("DATABASE_URL does not look like mysql://user:password@host:port/database.");
  console.error(`What was pasted (user and password hidden): ${describeShape(raw)}`);
  process.exit(2);
}

// The URL's own ?ssl=... options are not used: drizzle-kit and mysql2 read
// them differently. TiDB requires TLS, so it is set explicitly — except for a
// local database, which has none.
const conn = await mysql
  .createConnection({
    host: url.host,
    port: url.port,
    user: url.user,
    password: url.password,
    database: url.database,
    ssl: isLocalHost(url.host) ? undefined : { minVersion: "TLSv1.2", rejectUnauthorized: true },
  })
  .catch((e) => {
    console.error(`Could not connect to ${url.host}: ${e.code ?? ""} ${e.message}`);
    process.exit(1);
  });

console.log(`Checking ${url.host} / ${url.database}`);
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
