/**
 * Parse a database URL the way a person PASTES it, for scripts/db-verify.mjs.
 *
 * Not `new URL()`: that rejects a password containing `/` (it starts the path)
 * and splits one containing `#` or `?`, and it has no idea that a value copied
 * out of a shell command arrives with its quotes or its `DATABASE_URL=` still
 * attached. Each of those turned a correct production URL into "not a URL".
 *
 * The password runs to the LAST `@` before the host, because a host can never
 * contain `@` and a password can. Query options (`?ssl=...`) are dropped: the
 * caller sets TLS itself.
 */

/** Undo what a shell paste leaves behind: export, the variable name, quotes. */
function clean(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^export\s+/, "").replace(/^DATABASE_URL\s*=\s*/, "").trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s.at(-1) === s[0]) s = s.slice(1, -1).trim();
  return s;
}

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part; // a literal % that was never encoded
  }
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);

/** @returns {{user: string, password: string, host: string, port: number, database: string} | null} */
export function parseDbUrl(raw) {
  const m = /^mysql:\/\/([^:@/]+):(.*)@([^@/:?#]+)(?::(\d+))?\/([^?#/]+)(?:[?#].*)?$/s.exec(clean(raw));
  if (!m) return null;
  const [, user, password, host, port, database] = m;
  return {
    user: decode(user),
    password: decode(password),
    host,
    port: port ? Number(port) : LOCAL.has(host) ? 3306 : 4000,
    database: decode(database),
  };
}

/** What a pasted value looks like, without its user or password. */
export function describeShape(raw) {
  const s = String(raw ?? "").trim();
  const notes = [];
  if (/^["']/.test(s)) notes.push("quoted");
  if (/DATABASE_URL\s*=/.test(s)) notes.push("has a DATABASE_URL= prefix");
  const scheme = /^[^a-z]*([a-z][a-z0-9+.-]*):\/\//i.exec(s.replace(/^.*?=\s*/, ""))?.[1];
  notes.push(scheme ? `scheme ${scheme}://` : "no scheme:// found");
  notes.push(`${(s.match(/@/g) ?? []).length} @`);
  const at = s.lastIndexOf("@");
  if (at >= 0) notes.push(`after the last @: ${s.slice(at + 1).replace(/["']+$/, "").replace(/\?.*$/, "?…")}`);
  notes.push(`${s.length} characters`);
  return notes.join(" · ");
}

export const isLocalHost = (host) => LOCAL.has(host);
