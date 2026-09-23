// The replica's world: one office block in Neihu (內湖) and 28 places around it.
// Shared by the fake Google (fake-google.mjs) and the seed (seed.mjs) so a place
// the seed puts on a wheel is the same place a search returns.
//
// The noise is deliberate — every row below exists because the real Google
// returns something like it: a breakfast shop shut at noon, a tea house, chains,
// a 2.8 with 64 reviews, a 5.0 with ONE review, a temporarily closed and a
// permanently closed place, a noodle shop that shuts at 12:25, a lunch-only
// bento shop, and a second page further out.

export const OFFICE = { lat: 25.0797, lng: 121.575 };

// [zh, en, types, rating, reviews, price, openNow, business_status, metresNorth, metresEast, hours]
const RAW = [
  ["瑞麟美而美早餐", "Ruilin Meiermei Breakfast", "restaurant", 3.9, 120, 1, false, "OPERATIONAL", 60, 70, "breakfast"],
  ["鵝肉担", "Goose Meat Dan", "restaurant", 4.3, 812, 1, true, "OPERATIONAL", -90, 80, "lunch"],
  ["賢明茶館", "Shian Ming Tea", "restaurant", 4.6, 201, 1, true, "OPERATIONAL", 120, -90, "allday"],
  ["這家炒飯J+", "Zhe Jia Fried Rice J+", "meal_takeaway,restaurant", 4.4, 356, 1, true, "OPERATIONAL", 150, 100, "lunch"],
  ["麥當勞 內湖科技園區店", "McDonald's Neihu Tech Park", "restaurant", 3.6, 3100, 1, true, "OPERATIONAL", -140, -150, "allday"],
  ["宋王豬腳", "Song Wang Pork Knuckle", "restaurant", 4.2, 1203, 1, true, "OPERATIONAL", 200, -130, "lunch"],
  ["定盒所餐盒", "Dinghe Bento", "meal_takeaway,restaurant", 4.1, 98, 1, true, "OPERATIONAL", -230, 110, "lunchOnly"],
  ["八方雲集 內湖店", "Bafang Dumpling Neihu", "restaurant", 3.8, 900, 1, true, "OPERATIONAL", 260, 60, "allday"],
  ["火鍋106", "Hot Pot 106", "restaurant", 4.5, 2011, 2, true, "OPERATIONAL", -120, 290, "lunch"],
  ["老張牛肉麵", "Lao Zhang Beef Noodles", "restaurant", 2.8, 64, 1, true, "OPERATIONAL", 310, 90, "lunch"],
  ["珍煲酸白菜鍋", "Zhenbao Sauerkraut Pot", "restaurant", 4.3, 640, 2, true, "OPERATIONAL", -300, -170, "lunch"],
  ["莫宰羊", "Mo Zai Yang Lamb", "restaurant", 4.0, 1540, 2, true, "OPERATIONAL", 340, -180, "lunch"],
  ["暫停營業小吃", "Paused Snack Bar", "restaurant", 4.0, 45, 1, undefined, "CLOSED_TEMPORARILY", -380, 60, "lunch"],
  ["台記家傳手勁麵", "Tai Ji Hand-pulled Noodles", "restaurant", 4.2, 877, 1, true, "OPERATIONAL", 90, 410, "closingSoon"],
  ["摩斯漢堡 內湖瑞光店", "MOS Burger Ruiguang", "restaurant", 3.0, 540, 1, true, "OPERATIONAL", -420, -210, "allday"],
  ["Gigi", "Gigi", "restaurant", 5.0, 1, null, true, "OPERATIONAL", 480, 150, "unknown"],
  ["吉野家 內湖店", "Yoshinoya Neihu", "restaurant", 3.7, 1500, 1, true, "OPERATIONAL", -510, 120, "allday"],
  ["春水堂 內湖店", "Chun Shui Tang Neihu", "restaurant,cafe", 4.1, 2200, 2, true, "OPERATIONAL", 420, -380, "allday"],
  ["永和豆漿", "Yonghe Soy Milk", "restaurant", 3.8, 300, 1, true, "OPERATIONAL", -560, -260, "allday"],
  ["暹羅泰式料理", "Siam Thai Kitchen", "restaurant", 4.3, 410, 2, true, "OPERATIONAL", 600, 200, "lunch"],
  ["首爾韓式小館", "Seoul Korean Kitchen", "restaurant", 4.2, 380, 2, true, "OPERATIONAL", -280, 590, "lunch"],
  ["已歇業的餐館", "Closed Diner", "restaurant", 3.5, 88, 1, undefined, "CLOSED_PERMANENTLY", 640, -150, "lunch"],
  ["義大利麵工坊", "Pasta Workshop", "restaurant", 4.4, 290, 2, true, "OPERATIONAL", 700, 280, "lunch"],
  ["咖哩屋", "Curry House", "restaurant", 4.1, 210, 2, true, "OPERATIONAL", -720, -330, "lunch"],
  ["西貢越南河粉", "Saigon Pho", "restaurant", 4.0, 330, 1, true, "OPERATIONAL", 760, -400, "lunch"],
  ["好味道自助餐", "Hao Wei Dao Buffet", "restaurant", 3.9, 150, 1, true, "OPERATIONAL", -820, 300, "lunch"],
  ["壽司郎 內湖店", "Sushiro Neihu", "restaurant", 4.2, 5000, 2, true, "OPERATIONAL", 860, 450, "lunch"],
  ["金峰滷肉飯", "Jin Feng Braised Pork Rice", "restaurant", 4.5, 9000, 1, true, "OPERATIONAL", -930, -420, "allday"],
];

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((OFFICE.lat * Math.PI) / 180);

export const PLACES = RAW.map((r, i) => ({
  placeId: `fake_${i + 1}`,
  zh: r[0],
  en: r[1],
  types: r[2].split(","),
  rating: r[3],
  reviews: r[4],
  price: r[5],
  openNow: r[6],
  status: r[7],
  lat: OFFICE.lat + r[8] / M_PER_DEG_LAT,
  lng: OFFICE.lng + r[9] / M_PER_DEG_LNG,
  hours: r[10],
}));

export const placeById = (id) => PLACES.find((p) => p.placeId === id);

/** Great-circle metres. */
export function haversine(a, b) {
  const R = 6371000;
  const t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t;
  const dLng = (b.lng - a.lng) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** What the fake Distance Matrix answers: street distance ≈ 1.3× straight line, 1.25 m/s. */
export const walkMetres = (from, to) => Math.round(haversine(from, to) * 1.3);
export const walkSeconds = (from, to) => Math.round(walkMetres(from, to) / 1.25);

export const nameOf = (p, lang) => (lang === "en" ? p.en : p.zh);
export const addressOf = (p, lang) => {
  const n = 10 + Number(p.placeId.slice(5));
  return lang === "en" ? `No. ${n}, Ruiguang Rd, Neihu District, Taipei City` : `台北市內湖區瑞光路${n}號`;
};

/** Google `opening_hours.periods` for each hours kind (local time, UTC+8). */
export function periods(kind) {
  const day = (d, open, close) => ({ open: { day: d, time: open }, close: { day: d, time: close } });
  const monSat = [1, 2, 3, 4, 5, 6];
  switch (kind) {
    case "breakfast":
      return monSat.map((d) => day(d, "0600", "1100"));
    case "lunchOnly":
      return [1, 2, 3, 4, 5].map((d) => day(d, "1100", "1400"));
    case "closingSoon":
      return monSat.flatMap((d) => [day(d, "1030", "1225"), day(d, "1700", "2000")]);
    case "allday":
      return [0, ...monSat].map((d) => day(d, "0700", "2200"));
    case "unknown":
      return null;
    default:
      return monSat.flatMap((d) => [day(d, "1100", "1430"), day(d, "1700", "2100")]);
  }
}
