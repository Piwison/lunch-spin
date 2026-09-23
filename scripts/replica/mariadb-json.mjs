// Preloaded into the dev server. MariaDB stores JSON as LONGTEXT, so mysql2 hands
// Drizzle a string where TiDB (staging and production) hands it a parsed object,
// and Drizzle's json() column has no mapFromDriverValue of its own. Without this,
// every stored opening-hours list parses to null and every place reads "need
// hours" — a replica artifact (AGENTS.md failure mode 71), never an app bug.
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = realpathSync(join(repo, "node_modules/drizzle-orm/mysql-core/columns/json.js"));
const { MySqlJson } = await import(pathToFileURL(file).href);
MySqlJson.prototype.mapFromDriverValue = (value) => (typeof value === "string" ? JSON.parse(value) : value);
