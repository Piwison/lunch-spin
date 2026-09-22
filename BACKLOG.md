# BACKLOG — 尚未排程的工作

`ROADMAP.md` 是已完成回合的紀錄，`todo.md` 是歷史清單。這份是**前瞻**：已經想清楚、
但還沒排進任何一輪的東西。

每一項標註**證據等級**，因為這個 repo 吃過太多次「從程式碼讀出來的推論被當成事實」的虧
（AGENTS.md 失敗模式 60）：

- **已驗證** — 在真實瀏覽器／真實環境量測過
- **已確認** — 讀過程式碼，邏輯確定，但沒有跑過
- **假設** — 推論，需要量測才能動工

---

## 0. 先做這個：確認 migration 有沒有套用

**證據等級：假設（只有我能讀到的 ROADMAP 說法 + 程式碼路徑確認）**

`ROADMAP.md` 說 migration 0014–0017 已產生但從未套用。程式碼路徑確認是活的，
所以**如果**真的沒套用，線上有三個功能是壞的：

| Migration | 內容 | 沒套用時壞掉的東西 |
|---|---|---|
| 0017 | `wheels.sourceWheelId`、`areaLabel`、`listedInDirectory` | 「複製輪盤」（`WheelSelector.tsx:568`、`WheelApp.tsx:478`）、`wheels.copyCount`（`retry:false`，**無聲失敗**） |
| 0016 | `restaurants.hoursUpdatedAt`、`utcOffsetMinutes` | 營業時間 /「現在有開」 |
| 0015 | `restaurant_ratings` 資料表 | 星等評分、History 的 Team Taste 卡片 |
| 0014 | 8 個索引 | 只是慢，不會壞 |

**檢查方式（不要用 ROADMAP 舊版寫的 `SELECT tag FROM __drizzle_migrations`，
那個指令不可能跑得起來 — 見失敗模式 50）：**

```sql
SHOW COLUMNS FROM wheels LIKE 'sourceWheelId';        -- 0017
SHOW COLUMNS FROM restaurants LIKE 'hoursUpdatedAt';  -- 0016
SHOW TABLES LIKE 'restaurant_ratings';                -- 0015
```

補的指令是冪等的，一次補完所有缺的，**staging 先**：

```
DATABASE_URL='<staging>' pnpm exec drizzle-kit migrate
DATABASE_URL='<prod>'    pnpm exec drizzle-kit migrate
```

---

## 1. Onboarding：第一次搜尋到底給不給得到想要的店

Wireframe：https://claude.ai/artifact/UQfqaUuFrqj7BTamsohu8i （私人）

**已決定（2026-09-22）**：走**提案 A** — 先給結果，chip 調整。提案 B（先問三題）
不採用，wireframe 的 B1/B2 保留當紀錄。理由：B 多一整個步驟，而且新使用者第一眼
看到的是表單，那正是 `OnboardingFlow.tsx` 的註解記錄上一版被否決的原因。

B 的好處（第一份清單就個人化）用另一個方式拿：**記住上次的 chip**，
下次開新輪盤時當預設值。除了人生第一次搜尋，每一次的第一份清單都是個人化的。

### 1a. `rankby=distance` — 換掉搜尋的原料

**證據等級：假設 — 需要真的 API key 驗證**

現在送給 Google 的是 `radius=900 & type=restaurant`，**沒有設 `rankby`**，
legacy Places API 的預設是 `prominence`（知名度）。在密集區域，900 公尺內有幾百家餐廳，
Google 只回最「有名」的 20 家 — 偏向連鎖與大店。然後 `shared/nearby.ts` 再把連鎖店
降權 ×0.5。**我們先跟 Google 要最有名的，再懲罰它們有名。**

`rankby=distance` 合法（需 keyword/name/type 之一，我們有 `type=restaurant`；但 radius
必須拿掉）。驗證方式是同一座標打兩次比對清單。

這是整條管線的**原料**，排最前面 — 原料錯了，後面的排序和篩選都是白工。

### 1b. server 回 25 家候選，不是 12 家

**證據等級：已確認**

`shared/nearby.ts:135` 是 `deduped.slice(0, MAX_SEGMENTS)`，`MAX_SEGMENTS = 12`。
**server 在回傳前就把 12 家以外的全丟了**，所以 client 手上沒有備料，任何篩選一做就見底。

`walkingMatrix` 的註解自己寫著「max ~12 — well under the API's 25-per-request cap」：
Distance Matrix 一個請求吃得下 25 個目的地。所以回 25 家（都有真實步行時間）
**Google API 呼叫次數完全不變**，還是兩次。

輪盤照樣最多轉 `MAX_SEGMENTS = 12` 家 — 多出來的 13 家是給 client 篩選用的備料，
不是拿去轉的。這兩個上限要分開，不要共用同一個常數。

### 1c. client 瞬間篩選，只有三種情況才連網

**證據等級：已確認（哪些欄位在回傳裡）**

一次 `searchNearby` 實際打**兩個** Google API（`searchNearbyRestaurants` +
`walkingMatrix`），所以「一個 chip 一次請求」是一次兩發。但大部分 chip 根本不需要連網：

| 操作 | 要重新問 Google 嗎 | 為什麼 |
|---|---|---|
| 縮小步行時間 | 不用 | 900m 的結果裡就有 400m 內的 |
| 縮小價位 | 不用 | `price_level` 已在回傳裡 |
| 只看營業中 | 不用 | `open` 已在回傳裡 |
| 換關鍵字 | **要** | 這是換一個查詢 |
| 範圍變大 | **要** | 沒拿過那些店 |
| 篩到 < `MIN_SEGMENTS` | **要** | 備料見底了 |

**縮小條件永遠不需要新請求。** 需要的只有使用者在要「沒看過的東西」的時候。

刻意**不做**「手動 trigger 按鈕」：那會讓 chip 顯示新狀態、清單顯示舊結果，
畫面同時講兩個互相矛盾的事實 — 失敗模式 38 和 54 的形狀。瞬間篩選連這個狀態都不存在。

見底時的處理照 `shared/spinBlock.ts` 已有的形狀：列出能把店放回來的解法，
**最便宜的先講**，唯一會連網的那顆標明「重新搜尋」。

### 1d. 自動排除 Google 評分過低的店

**證據等級：已確認（`rating` / `user_ratings_total` 完全沒接）**

`shared/placeMapping.ts` 沒有映射 `rating`，也沒有 `user_ratings_total` —
Google 有回，我們直接丟掉。grep 整個 `shared/` 和 `server/` 是零次命中。

規則（門檻是判斷，不是量測，所以做成好改的常數）：

- 門檻 **3.0**。台灣營業中的餐廳絕大多數在 3.5–4.5，2.5 幾乎篩不掉東西
- **只在 `user_ratings_total >= 5` 時套用**。沒評分 ≠ 評分低 —
  新開的店和巷弄小店常常沒人評，而那正是這產品想找的。評論太少的保留並標註「評論太少」
- **不能靜默隱藏**：顯示「已隱藏 N 家評分低於 3.0 的店」並可一鍵顯示（失敗模式 54）
- 這是**候選階段**的硬篩（不該端上桌的不要端）。
  已經在某人輪盤上的店，排除規則維持軟性 — `shared/nearby.ts` 的
  「soft filters that RE-RANK instead of excluding」不動

### 1e. `next_page_token` 多抓 1–2 頁

**證據等級：已確認（API 行為）／假設（值不值得）**

Google 每頁最多 20 筆，`next_page_token` 最多到 60 筆。多抓能讓本地排序有 40–60 個
候選可以挑，而不是 20 個。代價：每頁一個額外請求，且 Google 要求 token 生效前有短暫延遲
（~2s）。first-run 的搜尋延遲是使用者看得到的，**先量測再決定**。

### 1f. 定位權限預先偵測

**證據等級：已驗證（grep：`navigator.permissions` 在整個 `client/src` 出現 0 次）**

`LocationPicker` 已經有三條路（瀏覽器定位／搜尋地標／貼 Maps 連結），這部分是完整的。
問題是：一個**永久拒絕過定位**的使用者，看到的還是一顆必定失敗的「使用我的位置」，
另外兩條路藏在「或用別的方式設定」後面。

要做的：
- `navigator.permissions.query({ name: 'geolocation' })` → `denied` 時以搜尋為主要入口
- 把摺疊拿掉（它藏的是三分之二的可用路徑）

**不要做的**：網頁**沒有任何 API** 可以開啟手機或瀏覽器的定位設定。iOS Safari 沒有、
Android Chrome 也沒有。任何「一鍵開啟設定」的做法都是假的，不要實作。

純 client，不動 server，可獨立進行。

---

## 2. SEO / 成長（**暫停中** — 等自訂網域）

2026-09-22 決定：先做產品，網域之後再換。已完成的 P0 不需重做，因為所有絕對網址都走
`VITE_SITE_ORIGIN` 環境變數 + fallback（`vite.config.ts` 的 `seoOriginPlugin`）。

### 2a. 自訂網域

推薦 `lunchwheel.app`（$9.99 首年 / $15 續約，2026-09-22 查為可註冊）。
買好後在 Vercel 設 `VITE_SITE_ORIGIN=https://lunchwheel.app`，build 自動重算
canonical / OG / sitemap / robots，**不需改任何程式碼**。

備案：`turnlunch.com`（$11.25 不漲價）、`lunchspin.app`、`spinlunch.app`。
`lunchwheel.tw` 可註冊但 Vercel 不支援註冊 .tw，且 ccTLD 會把地理訊號鎖在台灣。

**刻意不做**：不要為了等網域加 `noindex`。現在沒人連過來，自然索引機率趨近於零；
加了就多一件「之後要記得拿掉」的事，忘記的代價是靜默的零流量（失敗模式 55 的形狀）。

### 2b. 爬蟲 meta SSR（P1）

**證據等級：已確認**

`vercel.json` 把所有非 `/api` 路徑 rewrite 到同一份 `index.html`，且沒有 SSR。
LINE / FB / Slack 不執行 JS，所以**每一個輪盤連結和邀請連結，貼出去都是同一張
landing page 的預覽卡**。

要做的：`/w/:id`、`/join/:token` 導到 `/api`，server 回傳帶正確 OG 的 HTML
（標題＝輪盤名、描述＝「12 家店 · 內湖」、動態 OG 圖）。動 `server/` → 重建 `api/index.js`。

### 2c. hreflang + `/en` 路由

**證據等級：已確認**

現在**刻意沒加** hreflang，因為沒有對應的 URL — 指向不存在的網址比不加更糟。
等有 `/en` 路由再加。

### 2d. 公開輪盤目錄（P2）

**證據等級：已確認 — schema 有，功能沒有**

`drizzle/schema.ts:67,74` 已有 `areaLabel` 和 `listedInDirectory`，但**整個功能沒做**，
migration 0017 也還沒套用。`/wheels/內湖` 這類頁面是唯一能長期吃自然搜尋的資產。
等 2a + 2b 都好了再說。

---

## 3. i18n

### 3a. app 內部繁中

**證據等級：已確認**

`client/src/i18n/` 的基礎設施已建（`dict.ts` + `LangProvider` + `t()`），
`en` 用 `Record<MessageKey, string>` 綁死，漏翻會在 `pnpm check` 失敗。
**但目前只有 landing page 用了它** — 登入後整個 app 還是硬編碼英文。

對「台灣用戶為主」的產品，這是每天每次使用都會碰到的斷裂：landing 中文、一登入變英文。

### 3b. CJK 字型 fallback

**證據等級：已確認**

`index.html` 只 preload `bricolage-latin.woff2`，`index.css` 的 `font-family` 是
`"Bricolage Grotesque"` 不帶明確 CJK fallback。中文字會掉到瀏覽器預設 —
Windows 可能拿到細明體而不是微軟正黑體。要一條明確的 stack
（`"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`）。

**不要自行 self-host 中文字型**：完整 CJK 字檔是 MB 等級，系統字型在三大平台都夠好。

---

## 4. 小項

### 4a. `--ease-decay` 是死 token

**證據等級：已驗證（grep）**

`client/src/index.css:490` 定義了 `--ease-decay: cubic-bezier(0.08, 0.82, 0.17, 1)`，
但整個 `client/src` 唯一提到它的地方是 `LandingWheel.tsx:41` 的註解 —
而那段註解是在說明**為什麼不用它**。

失敗模式 45 記錄了這條曲線的問題（把 59% 的旋轉塞進前十分之一），修法是把減速移到 JS。
CSS token 留下來了但沒人用。獨立量測確認過它的形狀就是 45 記錄的那樣。

確認真的沒有動態組字串引用之後刪掉。

---

## Changelog

- 2026-09-22 — 建立。來源：marketing / landing page 那一輪（P0 已 ship）+ onboarding
  第一次搜尋品質的討論。SEO 在 2a 之前暫停。
- 2026-09-22 — Onboarding 定案走提案 A。1b/1c/1d 依 wireframe 討論改寫：
  server 回 25 家、client 瞬間篩選、評分過濾。原 1c/1d 順延為 1e/1f。
