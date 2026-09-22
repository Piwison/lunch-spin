/**
 * Landing-page copy, in the two languages the site ships.
 *
 * Scope note: this covers the PUBLIC surface (the marketing page). The signed-in
 * app is still hardcoded English — translating it is the next chunk, not a thing
 * this file silently half-did. Keys are grouped by section so a translator can
 * read them top to bottom in the order they appear on the page.
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
