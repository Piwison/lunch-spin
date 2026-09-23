// Preloaded into the dev server (NODE_OPTIONS=--import). Answers every request to
// maps.googleapis.com with Google-shaped JSON built from fixture.mjs, so the real
// server pipeline (mapping, rating filter, dedupe, walk times, language, paging)
// runs end to end without a key. Everything else goes to the real fetch.
//
// Every call is appended to $REPLICA_STATE/google-calls.log — the cheapest way to
// see what the server actually asked Google for.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICE, PLACES, placeById, haversine, walkMetres, nameOf, addressOf, periods } from "./fixture.mjs";

const STATE = process.env.REPLICA_STATE || join(dirname(fileURLToPath(import.meta.url)), ".state");
mkdirSync(STATE, { recursive: true });
const LOG = join(STATE, "google-calls.log");
const realFetch = globalThis.fetch;

const toGoogle = (p, lang) => ({
  place_id: p.placeId,
  name: nameOf(p, lang),
  vicinity: addressOf(p, lang),
  formatted_address: addressOf(p, lang),
  geometry: { location: { lat: p.lat, lng: p.lng } },
  types: [...p.types, "food", "point_of_interest", "establishment"],
  rating: p.rating,
  user_ratings_total: p.reviews,
  ...(p.price != null ? { price_level: p.price } : {}),
  ...(p.openNow !== undefined ? { opening_hours: { open_now: p.openNow } } : {}),
  business_status: p.status,
});
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

// A real next_page_token carries the whole original query (language, keyword,
// location). Encode it the same way, or page two silently comes back in a
// different language / unfiltered — a replica artifact, not an app bug.
const encodeToken = (q) => Buffer.from(JSON.stringify({ ...q, page: 2 })).toString("base64url");
const decodeToken = (t) => {
  try {
    return JSON.parse(Buffer.from(t, "base64url").toString());
  } catch {
    return null;
  }
};

function nearby(q) {
  const lang = q.language === "en" ? "en" : "zh-TW";
  const [lat, lng] = (q.location ?? `${OFFICE.lat},${OFFICE.lng}`).split(",").map(Number);
  const origin = { lat, lng };
  let list = PLACES.map((p) => ({ p, d: haversine(origin, p) })).sort((a, b) => a.d - b.d);
  if (q.keyword) {
    const k = q.keyword.toLowerCase();
    list = list.filter(({ p }) =>
      `${p.zh} ${p.en}`.toLowerCase().includes(k) ||
      (k.includes("麵") && p.zh.includes("麵")) ||
      (k.includes("noodle") && /noodle|pho|pasta/i.test(p.en)),
    );
  }
  if (q.radius) list = list.filter(({ d }) => d <= Number(q.radius));
  const page = q.page === 2 ? 2 : 1;
  const slice = page === 2 ? list.slice(20, 40) : list.slice(0, 20);
  const results = slice.map(({ p }) => toGoogle(p, lang));
  return json({
    status: results.length ? "OK" : "ZERO_RESULTS",
    results,
    ...(page === 1 && list.length > 20 ? { next_page_token: encodeToken(q) } : {}),
  });
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input.url ?? String(input));
  if (!/maps\.googleapis\.com|maps\.app\.goo\.gl|google\.com\/maps/.test(url)) return realFetch(input, init);
  const u = new URL(url);
  const q = Object.fromEntries(u.searchParams);
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${u.pathname} ${JSON.stringify({ ...q, key: undefined })}\n`);
  } catch {
    // logging is best-effort
  }
  const lang = q.language === "en" ? "en" : "zh-TW";

  if (u.pathname.endsWith("/place/nearbysearch/json")) {
    if (q.pagetoken) {
      const original = decodeToken(q.pagetoken);
      return original ? nearby(original) : json({ status: "INVALID_REQUEST", results: [] });
    }
    return nearby(q);
  }

  if (u.pathname.endsWith("/distancematrix/json")) {
    const [olat, olng] = q.origins.split(",").map(Number);
    const origin = { lat: olat, lng: olng };
    const elements = q.destinations.split("|").map((d) => {
      let to;
      if (d.startsWith("place_id:")) to = placeById(d.slice(9));
      else {
        const [a, b] = d.split(",").map(Number);
        to = { lat: a, lng: b };
      }
      if (!to) return { status: "NOT_FOUND" };
      const m = walkMetres(origin, to);
      return { status: "OK", distance: { value: m, text: `${m} m` }, duration: { value: Math.round(m / 1.25), text: `${Math.round(m / 75)} mins` } };
    });
    return json({ status: "OK", rows: [{ elements }] });
  }

  if (u.pathname.endsWith("/place/details/json")) {
    const p = placeById(q.place_id);
    if (!p) return json({ status: "NOT_FOUND" });
    const per = periods(p.hours);
    return json({
      status: "OK",
      result: {
        place_id: p.placeId,
        name: nameOf(p, lang),
        formatted_address: addressOf(p, lang),
        geometry: { location: { lat: p.lat, lng: p.lng } },
        rating: p.rating,
        user_ratings_total: p.reviews,
        utc_offset: 480,
        utc_offset_minutes: 480,
        url: `https://maps.google.com/?cid=${p.placeId}`,
        ...(per ? { opening_hours: { periods: per } } : {}),
      },
    });
  }

  if (u.pathname.endsWith("/place/textsearch/json") || u.pathname.endsWith("/place/findplacefromtext/json")) {
    const query = (q.query ?? q.input ?? "").toLowerCase();
    const landmarks = [
      { place_id: "lm_1", name: lang === "en" ? "Neihu Technology Park" : "內湖科技園區", formatted_address: lang === "en" ? "Neihu District, Taipei City" : "台北市內湖區", geometry: { location: OFFICE } },
      { place_id: "lm_2", name: lang === "en" ? "Ruiguang Rd Office Tower" : "瑞光路辦公大樓", formatted_address: lang === "en" ? "Ruiguang Rd, Neihu District, Taipei" : "台北市內湖區瑞光路", geometry: { location: { lat: OFFICE.lat + 0.001, lng: OFFICE.lng - 0.001 } } },
    ];
    const places = PLACES.filter((p) => `${p.zh} ${p.en}`.toLowerCase().includes(query)).map((p) => toGoogle(p, lang));
    const results = places.length ? places : query ? landmarks : [];
    if (u.pathname.includes("findplace")) return json({ status: results.length ? "OK" : "ZERO_RESULTS", candidates: results.slice(0, 1) });
    return json({ status: results.length ? "OK" : "ZERO_RESULTS", results });
  }

  return new Response("not found", { status: 404 });
};
