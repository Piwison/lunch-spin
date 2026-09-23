// Persistent browser driver for the replica. One headless_shell, one browser
// context per persona — each with its own cookie jar, localStorage and log — and
// a tiny HTTP command server on 127.0.0.1:9555. Drive it with b.mjs:
//
//   node scripts/replica/drv.mjs &              # start (needs server.sh running)
//   node scripts/replica/b.mjs use amy \; goto /app \; text \; shot wheel
//
// Personas: amy (owner), ben (member), chloe and dan (no wheel yet — first run),
// guest (signed out). The browser is set up as a Taiwanese iPhone at the office:
// 390x844, touch, Asia/Taipei, zh-TW Accept-Language, geolocation granted at the
// fixture's office, and a Date shim so the page's clock matches the DB's
// (failure mode 71 — three clocks must agree).
//
// Why not Playwright: the Playwright MCP looks for /opt/google/chrome/chrome and
// fails in the web container (failure mode 68); this talks CDP to headless_shell
// with Node's global WebSocket and needs nothing installed.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { OFFICE as FIXTURE_OFFICE } from "./fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = process.env.REPLICA_STATE || join(HERE, ".state");
const SHOTS = join(STATE, "shots");
mkdirSync(SHOTS, { recursive: true });
const PW = "/opt/pw-browsers";
const shell = readdirSync(PW).find((d) => d.startsWith("chromium_headless_shell-"));
if (!shell) throw new Error(`no chromium_headless_shell-* under ${PW}`);
const HS = join(PW, shell, "chrome-linux", "headless_shell");
const ORIGIN = `http://localhost:${process.env.PORT || 3000}`;
const OFFICE = { latitude: FIXTURE_OFFICE.lat, longitude: FIXTURE_OFFICE.lng, accuracy: 30 };
const ACCEPT_LANGUAGE = process.env.REPLICA_BROWSER_LANG || "zh-TW,zh;q=0.9,en;q=0.8";

// The page's clock = the DB's clock, read once at start.
const db = await mysql.createConnection(process.env.DATABASE_URL || "mysql://lunch:lunchpw@127.0.0.1:3306/lunch");
const [[{ ms }]] = await db.query("SELECT ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000) AS ms");
await db.end();
const CLOCK_OFFSET = Number(ms) - Date.now();

const port = 9444;
const proc = spawn(HS, ["--no-sandbox", `--remote-debugging-port=${port}`, "--hide-scrollbars", "--window-size=390,844", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ver;
for (let i = 0; i < 60; i++) {
  try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { /* not listening yet */ }
  await sleep(100);
}
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const pending = new Map();
const logs = new Map(); // sessionId -> {errors:[], net:[]}
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const L = m.sessionId && logs.get(m.sessionId);
  if (!L) return;
  if (m.method === "Runtime.exceptionThrown") L.errors.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning"))
    L.errors.push(m.params.type.toUpperCase() + " " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) {
    const u = new URL(m.params.request.url);
    L.net.push(`${m.params.request.method} ${decodeURIComponent(u.pathname.replace("/api/trpc/", ""))}`);
  }
  if (m.method === "Network.responseReceived" && m.params.response.url.includes("/api/") && m.params.response.status >= 400) {
    L.net.push(`  <- ${m.params.response.status} ${new URL(m.params.response.url).pathname}`);
  }
  if (m.method === "Page.javascriptDialogOpening") L.errors.push("DIALOG " + m.params.type + ": " + m.params.message);
});
const send = (method, params = {}, sessionId) => new Promise((r, j) => {
  const i = ++seq; pending.set(i, (m) => (m.error ? j(new Error(method + ": " + m.error.message)) : r(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const dateShim = `(() => {
  const OFF = ${CLOCK_OFFSET};
  const RD = Date;
  class FD extends RD {
    constructor(...a) { if (a.length === 0) super(RD.now() + OFF); else super(...a); }
    static now() { return RD.now() + OFF; }
  }
  FD.parse = RD.parse; FD.UTC = RD.UTC;
  globalThis.Date = FD;
})();`;

const personas = {};
let cur = "amy";
let W = 390, H = 844;

async function makePersona(name, cookie) {
  const { browserContextId } = await send("Target.createBrowserContext", { disposeOnDetach: false });
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  logs.set(sessionId, { errors: [], net: [] });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Emulation.setTimezoneOverride", { timezoneId: "Asia/Taipei" });
  await s("Emulation.setGeolocationOverride", OFFICE);
  await s("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", acceptLanguage: ACCEPT_LANGUAGE, platform: "iPhone" });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: dateShim });
  await send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation", "clipboardReadWrite", "clipboardSanitizedWrite"], browserContextId });
  if (cookie) await s("Network.setCookie", { name: "app_session_id", value: cookie, url: ORIGIN, path: "/", httpOnly: true, sameSite: "Lax" });
  personas[name] = { sessionId, targetId, browserContextId, s };
}

const tokens = JSON.parse(readFileSync(join(STATE, "tokens.json"), "utf8"));
for (const who of ["amy", "ben", "chloe", "dan"]) await makePersona(who, tokens[who]);
await makePersona("guest", null);

let shotN = 0;
const P = () => personas[cur];
const ev = async (expr) => {
  const r = await P().s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
};

const FIND = `(q, nth, exact) => {
  const re = q.startsWith("/") ? new RegExp(q.slice(1, q.lastIndexOf("/")), q.slice(q.lastIndexOf("/") + 1)) : null;
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const sel = "button, a, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=option], [role=switch], [role=checkbox], [role=radio], label, input, textarea, select, summary, [tabindex]";
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const cands = [...document.querySelectorAll(sel)].filter(vis);
  const hit = (e) => {
    const texts = [norm(e.innerText), norm(e.getAttribute("aria-label")), norm(e.getAttribute("placeholder")), norm(e.getAttribute("title")), norm(e.value)];
    return texts.some((t) => t && (re ? re.test(t) : exact ? t === q : t.toLowerCase().includes(q.toLowerCase())));
  };
  let m = cands.filter(hit);
  // prefer innermost
  m = m.filter((e) => !m.some((o) => o !== e && e.contains(o)));
  return m[nth] || null;
}`;

async function locate(q, nth = 0, exact = false) {
  const r = await ev(`(() => { const e = (${FIND})(${JSON.stringify(q)}, ${nth}, ${exact}); if (!e) return null;
    e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const d = (el) => el ? (el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? "[" + el.getAttribute("aria-label") + "]" : "") + " '" + (el.innerText || el.value || "").replace(/\\s+/g, " ").trim().slice(0, 50) + "'") : null;
    return { x, y, w: Math.round(r.width), h: Math.round(r.height), el: d(e), covered: top && !(e === top || e.contains(top) || top.contains(e)) ? d(top) : null };
  })()`);
  return r;
}

async function tap(x, y) {
  const s = P().s;
  await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await sleep(40);
  await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function mouseClick(x, y) {
  const s = P().s;
  await s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await s("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await s("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

const TEXT = `(() => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.replace(/\\s+/g, " ").trim(); if (t) out.push(t); return; }
    if (n.nodeType !== 1) return;
    const cs = getComputedStyle(n);
    if (cs.display === "none" || cs.visibility === "hidden" || n.getAttribute("aria-hidden") === "true" && !n.closest("[role=dialog]")) return;
    if (["SCRIPT","STYLE","NOSCRIPT","svg"].includes(n.tagName)) return;
    const block = /^(block|flex|grid|list-item|table)/.test(cs.display);
    const tag = n.tagName;
    const pre = tag === "BUTTON" || n.getAttribute("role") === "button" ? "[" : tag === "A" ? "<" : tag === "INPUT" || tag === "TEXTAREA" ? "{" : "";
    if (block || pre) out.push("\\n");
    if (pre === "{") { out.push("{" + (n.value || n.placeholder || "") + (n.type === "checkbox" ? (n.checked ? " ✓" : " ☐") : "") + "}"); return; }
    if (pre) out.push(pre);
    const al = n.getAttribute("aria-label");
    if (pre && al && !n.innerText.trim()) out.push("aria:" + al);
    if (n.getAttribute("role") === "switch" || n.getAttribute("role") === "checkbox") out.push(n.getAttribute("aria-checked") === "true" ? "(on)" : "(off)");
    for (const c of n.childNodes) walk(c);
    if (pre === "[") out.push("]"); if (pre === "<") out.push(">");
    if (block) out.push("\\n");
  };
  walk(document.body);
  return out.join(" ").replace(/ *\\n[ \\n]*/g, "\\n").replace(/\\[ /g, "[").replace(/ \\]/g, "]").trim();
})()`;

const cmds = {
  async use(name) { cur = name; return `now ${name}`; },
  async goto(path) {
    await P().s("Page.navigate", { url: path.startsWith("http") ? path : ORIGIN + path });
    await sleep(2200); return await ev("location.href");
  },
  async reload() { await P().s("Page.reload"); await sleep(2200); return "reloaded"; },
  async size(w, h) {
    W = +w; H = +h;
    for (const p of Object.values(personas)) await p.s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 800 });
    return `${W}x${H}`;
  },
  async click(q, nth = "0", mode = "tap") {
    const r = await locate(q, +nth);
    if (!r) return `NOT FOUND: ${q}`;
    await sleep(120);
    const r2 = await locate(q, +nth); // after scroll settles
    if (mode === "mouse") await mouseClick(r2.x, r2.y); else await tap(r2.x, r2.y);
    await sleep(700);
    return `clicked ${r2.el} ${r2.w}x${r2.h} @${Math.round(r2.x)},${Math.round(r2.y)}${r2.covered ? " COVERED BY " + r2.covered : ""}`;
  },
  async exact(q, nth = "0") {
    const r = await locate(q, +nth, true);
    if (!r) return `NOT FOUND: ${q}`;
    await tap(r.x, r.y); await sleep(700);
    return `clicked ${r.el} ${r.w}x${r.h}${r.covered ? " COVERED BY " + r.covered : ""}`;
  },
  async find(q) { return JSON.stringify(await locate(q)); },
  async at(x, y) { await tap(+x, +y); await sleep(600); return `tapped ${x},${y}`; },
  async type(...t) { await P().s("Input.insertText", { text: t.join(" ") }); await sleep(400); return "typed"; },
  async fill(q, ...t) {
    const r = await locate(q);
    if (!r) return `NOT FOUND: ${q}`;
    await tap(r.x, r.y); await sleep(150);
    await ev(`document.activeElement && document.activeElement.select && document.activeElement.select()`);
    await P().s("Input.insertText", { text: t.join(" ") }); await sleep(500);
    return `filled ${r.el}`;
  },
  async key(k) {
    const map = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ArrowDown: 40, ArrowUp: 38 };
    for (const type of ["keyDown", "keyUp"]) await P().s("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: map[k] || 0, ...(k === "Enter" && type === "keyDown" ? { text: "\r" } : {}) });
    await sleep(400); return `key ${k}`;
  },
  async text(max = "6000") { const t = await ev(TEXT); return t.length > +max ? t.slice(0, +max) + "\n…(" + t.length + " chars)" : t; },
  async shot(name, full) {
    const n = String(++shotN).padStart(2, "0");
    const file = join(SHOTS, `${cur}-${n}-${name}.png`);
    const params = { format: "png" };
    if (full === "full") {
      const h = await ev("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)");
      params.clip = { x: 0, y: 0, width: W, height: Math.min(h, 4000), scale: 1 }; params.captureBeyondViewport = true;
    }
    const r = await P().s("Page.captureScreenshot", params);
    writeFileSync(file, Buffer.from(r.data, "base64")); return file;
  },
  async eval(...js) { return JSON.stringify(await ev(js.join(" ")), null, 1); },
  async wait(ms) { await sleep(+ms); return `waited ${ms}`; },
  async scroll(y) { await ev(`(document.scrollingElement.scrollBy(0, ${+y}), [...document.querySelectorAll("*")].filter(e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach(e => e.scrollBy(0, ${+y})))`); await sleep(400); return `scrolled ${y}`; },
  async top() { await ev(`(scrollTo(0,0), [...document.querySelectorAll("*")].forEach(e => { if (e.scrollTop) e.scrollTop = 0; }))`); await sleep(300); return "top"; },
  async errors() { const L = logs.get(P().sessionId); const e = L.errors.splice(0); return e.join("\n") || "(no errors)"; },
  async net() { const L = logs.get(P().sessionId); const e = L.net.splice(0); return e.join("\n") || "(no api calls)"; },
  async geo(mode) {
    const { browserContextId, s } = P();
    if (mode === "deny") await send("Browser.setPermission", { permission: { name: "geolocation" }, setting: "denied", origin: ORIGIN, browserContextId });
    else if (mode === "prompt") await send("Browser.setPermission", { permission: { name: "geolocation" }, setting: "prompt", origin: ORIGIN, browserContextId });
    else { await send("Browser.setPermission", { permission: { name: "geolocation" }, setting: "granted", origin: ORIGIN, browserContextId }); await s("Emulation.setGeolocationOverride", OFFICE); }
    return `geo ${mode}`;
  },
  async storage(k, v) { if (v === undefined) return JSON.stringify(await ev(`Object.fromEntries(Object.entries(localStorage))`)); await ev(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`); return "set"; },
  async clearstorage() { await ev(`localStorage.clear(); sessionStorage.clear()`); return "cleared"; },
  async cookies() { const r = await P().s("Network.getCookies", { urls: [ORIGIN] }); return JSON.stringify(r.cookies.map((c) => c.name)); },
  async logout() { await P().s("Network.deleteCookies", { name: "app_session_id", domain: "localhost" }); return "cookie deleted"; },
  async login(who) { await P().s("Network.setCookie", { name: "app_session_id", value: tokens[who], url: ORIGIN, path: "/", httpOnly: true, sameSite: "Lax" }); return "cookie set"; },
  async dark(on) { await P().s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: on === "off" ? "light" : "dark" }] }); return "media set"; },
  async quit() { setTimeout(() => { proc.kill(); process.exit(0); }, 50); return "bye"; },
};

http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const { cmd, args } = JSON.parse(body);
  let out;
  try { out = cmds[cmd] ? await cmds[cmd](...args) : `unknown cmd ${cmd}`; } catch (e) { out = "ERR " + e.message; }
  res.end(String(out));
}).listen(9555, "127.0.0.1", () => console.log("driver ready, clock offset ms", CLOCK_OFFSET));
