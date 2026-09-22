/**
 * Landing-page copy, in the two languages the site ships.
 *
 * Scope note: this covers the PUBLIC surface (the marketing page) and the
 * first-run flow a new user lands in straight after it (`onb.*`, plus the shared
 * location picker, `loc.*`). The rest of the signed-in app is still hardcoded
 * English — translating it is BACKLOG.md 3a, not a thing this file silently
 * half-did. Because the location picker is shared, the ADD NEARBY dialog and the
 * add-form's name search show it translated inside otherwise-English dialogs
 * until 3a lands. Keys are grouped by section so a translator can read them top
 * to bottom in the order they appear on screen.
 *
 * `en` is typed as Record<Key, string> against the zh-TW keys, so adding a string
 * without translating it fails `pnpm check` rather than shipping a blank.
 */

export const zhTW = {
  // ── Hero ────────────────────────────────────────────────────────────────
  "hero.eyebrow": "免費 · 免安裝 · 不用登入就能先轉",
  "hero.title": "中午吃什麼？",
  "hero.subtitle": "把選擇障礙交給轉盤。加幾家店，按一下，10 秒解決午餐。",
  "hero.tryHint": "改成你公司樓下的店，直接試轉",
  "hero.cta": "免費開始",

  // ── Demo wheel ──────────────────────────────────────────────────────────
  "demo.spin": "開轉",
  "demo.spinning": "轉動中…",
  "demo.again": "再轉一次",
  "demo.winner": "今天就吃",
  "demo.addPlaceholder": "加一家店…",
  "demo.add": "加入",
  "demo.remove": "移除",
  "demo.removeOne": "移除 {name}",
  "demo.needTwo": "至少要有兩家店才轉得動",
  "demo.saveCta": "把這個輪盤存起來",
  "demo.listLabel": "這輪的候選",

  // ── Three steps ─────────────────────────────────────────────────────────
  "steps.eyebrow": "第一次用，30 秒",
  "steps.1.title": "定位",
  "steps.1.desc": "按一下，自動找出你走得到的餐廳",
  "steps.2.title": "勾選",
  "steps.2.desc": "預設幫你勾好 8 家，不想吃的取消就好",
  "steps.3.title": "開轉",
  "steps.3.desc": "輪盤直接建好，分享連結給同事",

  // ── Features ────────────────────────────────────────────────────────────
  "features.eyebrow": "為 11:45 的兵荒馬亂而做",
  "features.1.title": "走得到才算",
  "features.1.desc": "每家店都標步行分鐘數，不會轉到 20 分鐘車程外的店",
  "features.2.title": "最近吃過的自動跳過",
  "features.2.desc": "自己設幾天內不重複，不用再回想上禮拜吃了什麼",
  "features.3.title": "整組同事一起轉",
  "features.3.desc": "分享一個連結，大家同時看到同一個結果",
  "features.4.title": "不吃的先排除",
  "features.4.desc": "有人不吃牛、有人不吃辣，標記過就不會再轉到",

  // ── Popular public wheels ───────────────────────────────────────────────
  "popular.eyebrow": "不用登入，直接試",
  "popular.title": "熱門公開輪盤",
  "popular.restaurants": "{n} 家店",
  "popular.spins": "{n} 次轉動",
  "popular.spin": "轉這個",

  // ── Final CTA ───────────────────────────────────────────────────────────
  "final.title": "今天中午，不用再問「都可以」",
  "final.desc": "建一個你們辦公室的輪盤，之後每天只要按一下。",
  "final.cta": "免費開始",

  // ── First run: locate ───────────────────────────────────────────────────
  "onb.locate.titlePre": "看看",
  "onb.locate.titleAccent": "走路就到",
  "onb.locate.titlePost": "的午餐",
  "onb.locate.desc": "找出你附近真實的店家，直接變成你的第一個輪盤。",
  "onb.locate.searching": "正在找你附近的店…",
  "onb.locate.found": "找到 {n} 家",
  "onb.locate.manual": "我想自己加店",
  "onb.ring": "{n} 分",
  "onb.radarLabel": "以你為中心，步行 3、5、10 分鐘的範圍",

  // ── First run: pick ─────────────────────────────────────────────────────
  "onb.pick.title": "挑你的午餐名單",
  "onb.pick.desc": "已先勾好最近、營業中的 {n} 家，點一下就能加入或移除。",
  "onb.pick.descNone": "點一下店家就能加入輪盤。",
  "onb.pick.count": "附近 {n} 家",
  "onb.pick.fromHere": "從你現在的位置",
  "onb.pick.fromPlace": "從 {place}",
  "onb.pick.change": "換地點",
  "onb.keyword.placeholder": "想吃什麼？例如 拉麵、便當",
  "onb.keyword.submit": "搜尋",
  "onb.keyword.active": "「{q}」的結果",
  "onb.keyword.clear": "回到全部",
  "onb.chips": "篩選",
  "onb.chip.walk": "{n} 分鐘內",
  "onb.chip.price1": "$ 平價",
  "onb.chip.price2": "$$ 以下",
  "onb.chip.open": "營業中",
  "onb.band": "走路 {n} 分鐘內",
  "onb.band.far": "再遠一些",
  "onb.band.count": "{n} 家",
  "onb.card.walk": "步行 {n} 分鐘",
  "onb.card.walkApprox": "步行約 {n} 分鐘",
  "onb.card.unit": "分鐘",
  "onb.card.fewReviews": "評論太少",
  "onb.card.unrated": "尚無評分",
  "onb.card.open": "營業中",
  "onb.card.closed": "休息中",
  "onb.card.map": "在 Google 地圖查看 {name}",
  "onb.lowRated.hidden": "已隱藏 {n} 家 Google 評分低於 3.0 的店",
  "onb.lowRated.show": "顯示",
  "onb.lowRated.shown": "包含 {n} 家評分低於 3.0 的店",
  "onb.lowRated.hide": "隱藏",
  "onb.more": "找遠一點",
  "onb.more.hint": "往外再找一圈",
  "onb.more.loading": "往外找…",
  "onb.thin.title": "只剩 {n} 家符合",
  "onb.thin.titleNone": "沒有符合條件的店",
  "onb.thin.desc": "放寬一個條件就能多幾家：",
  "onb.thin.exhausted": "附近能找的店都在這裡了。換個地點，或自己加店。",
  "onb.relax.openOnly": "不限營業中",
  "onb.relax.priceCap": "不限價位",
  "onb.relax.walkCap": "不限步行時間",
  "onb.relax.lowRated": "顯示低評分",
  "onb.relax.gain": "+{n} 家",
  "onb.relax.research": "重新搜尋",
  "onb.cta.spin": "用這 {n} 家開轉",
  "onb.cta.needMore": "至少挑 {n} 家",
  "onb.cta.tooMany": "最多 {max} 家，請先取消 {n} 家",
  "onb.cap": "輪盤最多 {n} 家，先取消一家再加",

  // ── First run: building ─────────────────────────────────────────────────
  "onb.building.title": "正在組裝你的輪盤",
  "onb.building.desc": "加入 {n} 家店，順便確認營業時間…",

  // ── Location picker (shared) ────────────────────────────────────────────
  "loc.useMine": "用我現在的位置",
  "loc.finding": "定位中…",
  "loc.privacy": "只用在這次搜尋，不會儲存。",
  "loc.denied": "這個網站的定位已關閉，改用搜尋地點吧。要重新開啟，請到瀏覽器的網站設定。",
  "loc.err.unsupported": "這台裝置無法分享位置，改用搜尋地點吧。",
  "loc.err.denied": "定位權限被拒絕了，改用搜尋地點吧。",
  "loc.err.failed": "抓不到你的位置，改用搜尋地點吧。",
  "loc.err.noCoords": "找到「{name}」，但沒有它的確切位置。試試用名稱搜尋。",
  "loc.thatPlace": "那個地點",
  "loc.other": "或用其他方式設定",
  "loc.search.label": "搜尋公司或附近的地標",
  "loc.search.placeholder": "例如 台北101",
  "loc.search.submit": "搜尋",
  "loc.search.none": "找不到符合的地點。試試完整名稱，或在下方貼上地圖連結。",
  "loc.link.label": "或貼上 Google 地圖連結",
  "loc.link.aria": "Google 地圖連結",
  "loc.link.submit": "使用這個連結",

  // ── Chrome ──────────────────────────────────────────────────────────────
  "lang.switch": "English",
  "lang.label": "切換語言",
} as const;

export type MessageKey = keyof typeof zhTW;

export const en: Record<MessageKey, string> = {
  "hero.eyebrow": "Free · No install · Spin before you sign in",
  "hero.title": "What's for lunch?",
  "hero.subtitle":
    "Hand the decision to the wheel. Add a few places, tap once, lunch is settled.",
  "hero.tryHint": "Swap in the places by your office and give it a spin",
  "hero.cta": "Start free",

  "demo.spin": "Spin",
  "demo.spinning": "Spinning…",
  "demo.again": "Spin again",
  "demo.winner": "Today you eat",
  "demo.addPlaceholder": "Add a place…",
  "demo.add": "Add",
  "demo.remove": "Remove",
  "demo.removeOne": "Remove {name}",
  "demo.needTwo": "A wheel needs at least two places",
  "demo.saveCta": "Save this wheel",
  "demo.listLabel": "On the wheel",

  "steps.eyebrow": "First run, 30 seconds",
  "steps.1.title": "Locate",
  "steps.1.desc": "One tap finds the restaurants you can actually walk to",
  "steps.2.title": "Pick",
  "steps.2.desc": "Eight arrive already ticked — untick what you don't want",
  "steps.3.title": "Spin",
  "steps.3.desc": "The wheel is built. Share the link with your team",

  "features.eyebrow": "Built for the 11:45 scramble",
  "features.1.title": "Walking distance only",
  "features.1.desc": "Every place carries its walk time, so nothing 20 minutes away wins",
  "features.2.title": "Recently eaten is skipped",
  "features.2.desc": "Set your own no-repeat window and stop remembering last week",
  "features.3.title": "The whole team spins",
  "features.3.desc": "Share one link and everyone watches the same result land",
  "features.4.title": "Veto what you don't eat",
  "features.4.desc": "No beef, no chilli — mark it once and it stops coming up",

  "popular.eyebrow": "Try one without signing in",
  "popular.title": "Popular wheels",
  "popular.restaurants": "{n} places",
  "popular.spins": "{n} spins",
  "popular.spin": "Spin it",

  "final.title": "Nobody has to say “I don't mind” again",
  "final.desc": "Build your office's wheel once. After that it's one tap a day.",
  "final.cta": "Start free",

  "onb.locate.titlePre": "Lunch within ",
  "onb.locate.titleAccent": "walking distance",
  "onb.locate.titlePost": "",
  "onb.locate.desc": "We'll find real places near you and turn them straight into your first wheel.",
  "onb.locate.searching": "Looking around you…",
  "onb.locate.found": "Found {n} places",
  "onb.locate.manual": "I'll add places myself",
  "onb.ring": "{n} min",
  "onb.radarLabel": "Centred on you: 3, 5 and 10 minutes' walk",

  "onb.pick.title": "Pick your lunch list",
  "onb.pick.desc": "The {n} nearest open places are already ticked. Tap to add or remove.",
  "onb.pick.descNone": "Tap a place to put it on the wheel.",
  "onb.pick.count": "{n} nearby",
  "onb.pick.fromHere": "From where you are",
  "onb.pick.fromPlace": "From {place}",
  "onb.pick.change": "Change",
  "onb.keyword.placeholder": "Craving? e.g. ramen",
  "onb.keyword.submit": "Search",
  "onb.keyword.active": "Results for “{q}”",
  "onb.keyword.clear": "Back to all",
  "onb.chips": "Filters",
  "onb.chip.walk": "Within {n} min",
  "onb.chip.price1": "$ Cheap",
  "onb.chip.price2": "$$ & under",
  "onb.chip.open": "Open now",
  "onb.band": "Within {n} min walk",
  "onb.band.far": "A bit farther",
  "onb.band.count": "{n}",
  "onb.card.walk": "{n} min walk",
  "onb.card.walkApprox": "About {n} min walk",
  "onb.card.unit": "min",
  "onb.card.fewReviews": "Too few reviews",
  "onb.card.unrated": "No rating yet",
  "onb.card.open": "Open",
  "onb.card.closed": "Closed now",
  "onb.card.map": "View {name} on Google Maps",
  "onb.lowRated.hidden": "Hid {n} places rated under 3.0 on Google",
  "onb.lowRated.show": "Show",
  "onb.lowRated.shown": "Including {n} places rated under 3.0",
  "onb.lowRated.hide": "Hide",
  "onb.more": "Look farther",
  "onb.more.hint": "Search the next ring out",
  "onb.more.loading": "Looking farther…",
  "onb.thin.title": "Only {n} places match",
  "onb.thin.titleNone": "Nothing matches",
  "onb.thin.desc": "Loosen one of these to get more:",
  "onb.thin.exhausted": "That's everything nearby. Try another spot, or add places yourself.",
  "onb.relax.openOnly": "Include closed",
  "onb.relax.priceCap": "Any price",
  "onb.relax.walkCap": "Any distance",
  "onb.relax.lowRated": "Show low-rated",
  "onb.relax.gain": "+{n}",
  "onb.relax.research": "new search",
  "onb.cta.spin": "Spin these {n}",
  "onb.cta.needMore": "Pick at least {n}",
  "onb.cta.tooMany": "{max} at most — untick {n}",
  "onb.cap": "A wheel holds {n} at most — untick one first",

  "onb.building.title": "Building your wheel",
  "onb.building.desc": "Adding {n} places and checking their hours…",

  "loc.useMine": "Use my location",
  "loc.finding": "Finding you…",
  "loc.privacy": "Only used for this search — it's never stored.",
  "loc.denied":
    "Location is switched off for this site, so search for a place instead. To turn it back on, change it in your browser's site settings.",
  "loc.err.unsupported": "This device can't share its location — search for a place instead.",
  "loc.err.denied": "Location permission was denied — search for a place instead.",
  "loc.err.failed": "Couldn't get your location — search for a place instead.",
  "loc.err.noCoords": "Found “{name}” but not its exact location. Try searching for it by name.",
  "loc.thatPlace": "that place",
  "loc.other": "Or set it another way",
  "loc.search.label": "Search for your office or a nearby landmark",
  "loc.search.placeholder": "e.g. Taipei 101",
  "loc.search.submit": "Search",
  "loc.search.none": "No places matched that. Try a fuller name, or paste a Maps link below.",
  "loc.link.label": "Or paste a Google Maps link",
  "loc.link.aria": "Google Maps link",
  "loc.link.submit": "Use this link",

  "lang.switch": "中文",
  "lang.label": "Switch language",
};

/** Places seeded into the hero's demo wheel, per language. */
export const DEMO_PLACES: Record<"zh-TW" | "en", readonly string[]> = {
  "zh-TW": [
    "巷口牛肉麵",
    "樓下便當",
    "日式咖哩",
    "越南河粉",
    "韓式拌飯",
    "自助餐",
    "義大利麵",
    "滷肉飯",
  ],
  en: ["Ramen", "Burrito", "Thai", "Pizza", "Poke bowl", "Curry", "Pho", "Salad"],
};
