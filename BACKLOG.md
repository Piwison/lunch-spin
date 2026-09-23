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

### 1a. `rankby=distance` — 換掉搜尋的原料 ✅ 已定案 2026-09-22

**證據等級：已量測（2026-09-22，內湖 25.0797,121.5750，真實 API key）**

兩份清單**只重疊 2 家**（莫宰羊、台記家傳手勁麵），各有 18 家是對方沒有的。

**假設對的部分**：`prominence` 確實讓走路就到的一大票在地店完全看不見。
`distance` 撈到 鵝肉担、這家炒飯、宋王豬腳、定盒所餐盒、火鍋106、珍煲酸白菜鍋 —
內湖上班族中午真的會吃的東西。`prominence` 那份比較像「帶客戶去吃」
（CaLACaLA、Sam Won Garden、學學食驗室、王朝鐵板燒）。

**假設錯的部分**：`distance` 不是單純比較好。它同時撈進不是午餐的東西 —
Shian Ming Tea 與 Jiarunjai Tea House（茶館）、兩家早餐店（中午常關）、
Gigi / GROUN:D / Woopen（看不出是什麼，且 `price_level` 缺失）。
`type=restaurant` 擋不住這些，Google 的分類很鬆。

**所以結論不是「換成 distance」，是「distance 的原料比較對，但需要清理」。**
清理方式待定，卡在還沒拿到的兩個欄位（見下）。

**第二次量測（含 `types[]` 與 `user_ratings_total`）— 定案採用 `rankby=distance`**

`types[]` **分不出午餐與非午餐**。20 家裡 17 家的 types 完全相同
（`restaurant,food,point_of_interest,establishment`），而且：

| 店 | types | 午餐？ |
|---|---|---|
| Shian Ming Tea（茶館） | `restaurant,food,point_of_interest,establishment` | ✗ |
| 鵝肉担 | `restaurant,food,point_of_interest,establishment` | ✓ |
| Ruilin Meiermei Breakfast | `restaurant,food,point_of_interest,establishment` | ✗ |
| 火鍋106 | `restaurant,food,point_of_interest,establishment` | ✓ |

唯一帶特殊分類的方向還是反的：`這家炒飯J+` 帶 `meal_takeaway`，而它正是最像午餐的店之一。
`rating` / `user_ratings_total` 也分不出來（茶館 201 則 ★4.6，數字比鵝肉担漂亮）。

**所以「distance + 用 types 清理」這條路是死的，不要再試。**

**仍然採用 distance**，理由是雜訊的代價遠小於藏起來的代價：
1. `prominence` 的雜訊一樣多 — Journey Kaffe、SECOND FLOOR CAFE、學學食驗室、包青天手工蔬菜包
   也都不是午餐。兩邊都髒
2. 早餐店會自己消失 — 回傳有 `opening_hours.open_now`，而「只看營業中」這個 chip 已經存在。
   中午的早餐店是關的
3. 取消勾選本來就是這個步驟的設計（`OnboardingFlow` 註解：
   「progress is the default and de-selecting is the user's only job」）。
   取消一家茶館是一次點擊；`prominence` 藏住的 18 家在地店是完全看不到

**順帶要接的欄位**：`business_status`。~~Google 有回，我們沒接。~~ **訂正（2026-09-22）**：
其實早就接了 — `toNearbyPlace` 把非 `OPERATIONAL` 一律當成 `open: false`（軟性下沉）。
缺的是區分：暫停營業是「現在沒開」，永久歇業是「永遠不會是午餐」。1b/1c/1d 那輪補上了
`permanentlyClosed`，server 在排序前就丟掉，對三個呼叫端都生效。

現在送給 Google 的是 `radius=900 & type=restaurant`，**沒有設 `rankby`**，
legacy Places API 的預設是 `prominence`（知名度）。在密集區域，900 公尺內有幾百家餐廳，
Google 只回最「有名」的 20 家 — 偏向連鎖與大店。然後 `shared/nearby.ts` 再把連鎖店
降權 ×0.5。**我們先跟 Google 要最有名的，再懲罰它們有名。**

`rankby=distance` 合法（需 keyword/name/type 之一，我們有 `type=restaurant`；但 radius
必須拿掉）。驗證方式是同一座標打兩次比對清單。

這是整條管線的**原料**，排最前面 — 原料錯了，後面的排序和篩選都是白工。

### 1b. 別再把備料丟掉：回一頁能拿的全部，不是 12 家 — ✅ 已完成 2026-09-22

**做了什麼**：`shared/candidates.ts` 的 `CANDIDATE_POOL = 20` 與 `shared/nearby.ts` 的
`MAX_SEGMENTS = 12` 拆成兩個常數（測試釘住 20 > 12、20 ≤ 25）。`searchNearby` 新增
`limit`（上限 20）與 `rankBy`，兩個都是 opt-in：**ADD NEARBY 和名稱搜尋送的東西完全沒變**，
只有 first-run 送 `rankBy: "distance", limit: 20`。

**代價要講清楚**：Google API「呼叫次數」沒變（還是 Nearby 1 次 + Distance Matrix 1 次），
但 Distance Matrix 是**按 element 計費**，first-run 一次從 12 個 element 變 20 個。
新版計價下 Distance Matrix 每月有免費額度（以 Google console 為準），小流量應該碰不到，
但它是真實的邊際成本，不是零。

**證據等級：已確認**

`shared/nearby.ts:135` 是 `deduped.slice(0, MAX_SEGMENTS)`，`MAX_SEGMENTS = 12`。
**server 在回傳前就把 12 家以外的全丟了**，所以 client 手上沒有備料，任何篩選一做就見底。

**兩個上限不要搞混**（第一版寫錯過，訂正在此）：

- **Nearby Search 一頁最多 20 筆** — 這是免費備料的天花板，去重後更少
- **Distance Matrix 一個請求吃得下 25 個目的地** — 所以 20 家全部要真實步行時間，
  一個請求就夠

所以「**不增加任何 Google API 呼叫**」的上限是 **20（去重後約 15–18）**，不是 25。
要 25 家就得抓 `next_page_token`（見 1e）：多一次 Nearby Search，
且 Google 規定 token 生效前約 2 秒 — 那 2 秒會直接加在 first-run 的等待上。

**先用一頁出貨**，之後照 1e 量測再決定要不要加頁。

輪盤照樣最多轉 `MAX_SEGMENTS = 12` 家 — 多出來的是給 client 篩選用的備料，不是拿去轉的。
**這兩個上限要拆成兩個常數**，不要共用。

### 1c. client 瞬間篩選，只有三種情況才連網 — ✅ 已完成 2026-09-22

**已驗證**（真實瀏覽器 + mock API，每個請求記 log）：三個 chip 連點 = **0 個請求**；
想吃什麼（關鍵字）= 1 個請求，清除再打同一個 = 0 個（每個關鍵字的結果都留著）；
找遠一點 = 1 個請求（`next_page_token`，見 1e）。見底卡片依 `relaxations()` 列出
「放寬哪一個能多幾家」，最多的先講，唯一會連網的「找遠一點」標明「重新搜尋」。

**實作中發現並修掉的一個錯**：勾選原本是跨查詢共用一個集合，搜「麵」自動勾了 3 家，
按「回到全部」回來變成 11 家勾選 — 使用者留下的是 8 家。現在每個查詢有自己的勾選，
輪盤 = 目前畫面上可見且勾選的店（`onWheel`）。見 AGENTS.md 失敗模式 65。

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

### 1d. 自動排除 Google 評分過低的店 — ✅ 已完成 2026-09-22

`rating` / `user_ratings_total` 接進 `placeMapping`（缺值是 null 不是 0；超出 1–5 視為未知）。
規則照下面寫的做：3.0 門檻、≥ 5 則才判、評論太少標註、隱藏時顯示「已隱藏 N 家…」
並一鍵顯示。N 只算「其他條件都過、只因評分被藏」的店，所以按顯示回來的數量就是 N。
**範圍**：只有 first-run 套用。ADD NEARBY 沒有 — 它還是 12 家、沒有評分過濾。
（真實內湖資料沒有任何一家 < 3.0，所以驗證用的是一家標明為合成的測試店。）

**證據等級：已確認（`rating` / `user_ratings_total` 完全沒接）**

`shared/placeMapping.ts` 沒有映射 `rating`，也沒有 `user_ratings_total` —
Google 有回，我們直接丟掉。grep 整個 `shared/` 和 `server/` 是零次命中。

**2026-09-22 量測後的優先度調整**：內湖那兩份清單共 40 家，**最低評分是 MOS Burger 的 3.0**，
其餘最低 3.5。沒有任何一家低於 3.0 — 也就是在這種密度下，3.0 門檻篩掉的是零。
它是安全網（擋住真的很糟的店），不是改善來源。**優先度應排在 1a/1b/1c 之後。**

規則（門檻是判斷，不是量測，所以做成好改的常數）：

- 門檻 **3.0**。台灣營業中的餐廳絕大多數在 3.5–4.5，2.5 幾乎篩不掉東西
- **只在 `user_ratings_total >= 5` 時套用**。沒評分 ≠ 評分低 —
  新開的店和巷弄小店常常沒人評，而那正是這產品想找的。評論太少的保留並標註「評論太少」。
  **2026-09-22 量測佐證**：`Gigi ★5.0 / 1 則`。單則評分兩個方向都沒意義，
  這條規則真正防的是反過來的情況 — 一家新店被一個人打 2 星就被 3.0 門檻藏起來。
  （修正：我原先預測「很多家都是個位數評論」，實際上 20 家裡只有這 1 家。）
- **不能靜默隱藏**：顯示「已隱藏 N 家評分低於 3.0 的店」並可一鍵顯示（失敗模式 54）
- 這是**候選階段**的硬篩（不該端上桌的不要端）。
  已經在某人輪盤上的店，排除規則維持軟性 — `shared/nearby.ts` 的
  「soft filters that RE-RANK instead of excluding」不動

### 1e. `next_page_token` 多抓 1–2 頁 — 部分完成 2026-09-22

**已做**：按需要才抓。「找遠一點」送 `pageToken`，server 只送 token（Google 會忽略其他參數），
並在 token 還沒生效（`INVALID_REQUEST`）時最多重試 3 次、間隔 1.5 秒。新頁依步行時間
插入既有清單，不打亂已經在畫面上的卡片。**第一次搜尋不預先抓**，所以 first-run 等待時間沒變。
**未做**：要不要在第一次就多抓一頁 — 還是要先量測延遲再決定（下面原文）。

**證據等級：已確認（API 行為）／假設（值不值得）**

Google 每頁最多 20 筆，`next_page_token` 最多到 60 筆。多抓能讓本地排序有 40–60 個
候選可以挑，而不是 20 個。代價：每頁一個額外請求，且 Google 要求 token 生效前有短暫延遲
（~2s）。first-run 的搜尋延遲是使用者看得到的，**先量測再決定**。

### 1f. 定位權限預先偵測 — ✅ 已完成 2026-09-22

**證據等級：已驗證（CDP `Browser.setPermission` + 讀真實 DOM）**

已做：`shared/locationEntry.ts`（`locationEntryMode`，5 個測試，unknown → geolocation-first
的 fail-safe 有測試釘住）、`client/src/lib/geo.ts` 的 `watchGeoPermission`、
`LocationPicker` 依 mode 切換入口。

真實瀏覽器量測：`permissions.query` 在拒絕時回 `denied`、允許時回 `granted`；
**頁面載入後把權限翻成允許，`change` 事件會發** — 所以使用者去設定裡重開定位，
按鈕自己會回來，不用重新整理。拒絕狀態下實測：「Use my location」消失、
說明出現、手動區塊展開、燼橘主要色交給搜尋按鈕。

~~**還沒做**：這段新文案是英文的，會跟著 3a 一起翻。~~ 已翻（2026-09-22，onboarding 重新設計那輪，`loc.*`）。

原始問題留存如下 —

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
**目前用了它的只有 landing page 和 first-run（`onb.*`、共用的 `LocationPicker` 的 `loc.*`）**
— 登入後其餘的 app 還是硬編碼英文。已知的中英混排：`LocationPicker` 是共用元件，
所以 ADD NEARBY 對話框和新增店家的名稱搜尋裡，那一塊是中文、周圍是英文，直到 3a 做完。
`providerAlert`（Google 配額／設定錯誤訊息）也還是英文，first-run 會顯示到它。

對「台灣用戶為主」的產品，這是每天每次使用都會碰到的斷裂：landing 中文、一登入變英文。

**處理狀態（2026-09-23）：✅ 完成。** Codex 翻了登入後的 app（PR #38 → staging），Claude 接著補完
（同一條分支，staging 實測 390px 中英各走一輪：中文畫面沒有殘留英文、英文畫面沒有殘留中文）：
- 系統標籤（Japanese、Noodles…，資料庫存英文）只翻顯示：`places.tagName.*` + `lib/tagLabel.ts`，
  清單由 `shared/cuisineTag.test.ts` 對 0009 migration 釘住
- 步行時間、跳過剩餘時間改走字典（`lib/timeLabels.ts`，數字仍由 shared 算）；`StarRating`、sheet/dialog 的「關閉」
- 預設出發點 `Office`（存進資料庫的預設值）顯示為「公司」
- 地圖搜尋錯誤全部改用 key（`providerAlert().messageKey`），壞掉的地圖連結有專屬訊息；`NearbyDialog`、新增店家也送 `language`
- **修掉一個翻譯帶進來的 bug**：`ErrorBoundary` 的畫面改用 `useLang()`，但它包在 `LangProvider` 外面 → 任何渲染錯誤都變整頁空白。
  改用不需要 provider 的 `translateWithoutProvider`，實測中英文都回到錯誤畫面
- 用詞對齊術語表（可轉、這一輪、休息中／快打烊、收回否決、忌口、頁首 Lunch Wheel），並把 Codex 新增的「抽選／抽到」補進術語表

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

## 5. 2026-09-23 使用者測試（staging，390×844）

來源：`lunch-ux-test-2026-09-23.zip`（7 個 issue + 第二輪 demo 稽核 + axe 報告）。
每一項都回頭對過程式碼；「測試者的推測」和「實際原因」不同的地方有標出來。

| # | 問題 | 證據等級 | 實際原因 | 誰 | 需要業主決定？ |
|---|---|---|---|---|---|
| 5a | **Google 店名、地址是英文**（McDonald's - New Taipei 101 Store、Ruilin Meiermei Breakfast） | 已確認 | 所有 Places 請求都**沒有送 `language`**，Google 對美國機房的請求回英文。英文地址又解析不出「信義區」，所以新輪盤叫 `Lunch near me`。1a 那兩份量測的店名也是這個原因 | Claude | 否 |
| 5b | 建好輪盤後整個變英文 | 已確認 | **不是**測試者推測的「語系在 OAuth 後遺失」— `html[lang]` 還是 zh-Hant-TW，localStorage 也在。是 app 本來就還沒翻（3a），加上 5a 和 server 產生的英文輪盤名 | Codex（UI）＋ Claude（server） | 否 |
| 5c | 文案說「營業中的 8 家」但勾了休息中的店；按鈕說 8 家、輪盤只轉 6 家 | 已確認 | 文案是寫死的；`preselectPlaceIds` 在營業中的不夠時會用休息中的補滿（刻意的規則），而 server 開轉時跳過休息中的店 | Claude | **是**：休息中的要不要預設勾 |
| 5d | Demo 輪盤登入後不見 | 已確認 | `Home.tsx` 的「存起來」只是直接跳登入，什麼都沒保存 | Claude | **是**：帶過去的是「使用者自己加的店」還是整個 demo（預設 8 家是假店名，存成真輪盤會重犯「Pizza Place」的錯） |
| 5e | Demo 可以重複加同一家，偷偷改變機率 | 已確認 | `LandingWheel` 的 `addPlace` 沒有去重 | Claude | 否 |
| 5f | Demo 楔形沒有店名 | 已確認（刻意） | `LandingWheel` 註解：輪盤上的字是失敗模式 16/43/44/51 的雷區，landing 刻意不放 | Claude | **是**：編號楔形＋編號 chip、或轉動時高亮指針下的 chip、或維持現狀 |
| 5g | 390×844 首屏看不到「開轉」 | 已確認（截圖） | 輪盤＋候選 chip 把按鈕推到首屏外 | Claude | 否 |
| 5h | 到 10 家時輸入框直接消失、沒說明 | 已確認 | `LandingWheel` `places.length < MAX_PLACES &&` 整塊不渲染 | Claude | 否 |
| 5i | Demo chip 的 × 只有 22×22px | 已確認 | 按鈕寫死 22px | Claude | 否 |
| 5j | 語言／主題按鈕捲動時蓋住 demo | 已確認（截圖） | 兩顆是 fixed 浮動 | Claude | 否 |
| 5k | 不能縮放 | 已確認 | `client/index.html` 的 `maximum-scale=1`。移除時要確認所有輸入框 ≥ 16px，否則 iOS 聚焦會自動放大 | Claude | 否 |
| 5l | 柿子橘小字對比 3.48:1 | 已確認（已知取捨） | 失敗模式 20：業主看過加深版本後選擇維持。axe 會一直報 | — | **是**：維持，或只有 11px eyebrow 改用墨色 |
| 5m | 輪盤頁沒有 `<main>`、沒有 h1 | 已確認（axe） | `WheelApp` 版面 | Codex（順手在 WheelApp） | 否 |
| 5n | 帳號選單開啟時，背後 `aria-hidden` 的區塊還有可聚焦元素 | 假設 | axe 報告；Radix 選單的 modal 行為，需要實測 | — | 否 |

不算問題：自動化 Chrome 裡定位停在「定位中…」2.5 秒（沒有真機權限對話框）；staging 右側黑色圓鈕是 Vercel toolbar。

**處理狀態（2026-09-23，業主決定：5c/5d/5f/5l 用建議方案）**

- ✅ **5a** 所有 Places 請求都帶 `language`（預設 zh-TW，first run 和 LocationPicker 傳 UI 語言）；新輪盤名稱依 first run 的語言：`信義區的午餐`／`附近的午餐`
- ✅ **5b** server 那一半（輪盤名、店名語言）＋畫面翻譯（Codex 翻、Claude 補完，見 3a）
- ✅ **5c** 休息中的店不預設勾，只在營業中不到 2 家時補到 2 家；文案照實說；開轉按鈕第二行寫「其中 N 家現在休息中，今天轉不到」
- ✅ **5d** 只帶「自己加的店」（`shared/demoDraft.ts`，24 小時有效）：首頁存 → 登入 → first run 定位頁先告知、清單最上面「你在首頁加的」預設勾 → `createFromNearby.extraNames` → 建立後清掉。
  **沒做**：選「我想自己加店」（手動建立）的路線不會帶入 — 那個對話框在 WheelSelector（Codex 的檔案）
- ✅ **5e/5h/5i/5j/5k** 去重＋提示、10/10 計數與上限說明、× 實際 44×44、語言/主題按鈕移進頁首、移除 `maximum-scale`（輸入框改 16px 避免 iOS 聚焦放大）
- ✅ **5l** 全部的 11px 小標（`type-eyebrow`）從柿子橘改墨色（`--ink-warm`）：首頁與 first run（前一輪），加上 app 內 20 處（輪盤中心「可轉」、團隊成員、這一輪、結果頁「今天就吃」、紀錄頁統計、設定等）。實測淺色 11.7–13.3:1、深色 13.9–15.4:1（原 3.48:1）。按鈕、價格、圖示和 token 本身不動（失敗模式 17/20）
- ✅ **5m** 輪盤頁內容區改為 `<main>`，加一個只給螢幕閱讀器的 h1（輪盤名稱；first run 用它自己的 h1）。axe `landmark-one-main`、`page-has-heading-one` 通過
- 🆕 **axe 還會報的對比**（不在 5l 範圍，沒動）：標籤 chip 用標籤自己的顏色當字色（淺色 3.1:1、深色最低 2.5:1），以及步行時間 chip 上的灰字（3.92:1）。要改是設計決定，等業主看
- ✅ **5f、5g** 業主決定（2026-09-23）：首頁 demo 改用 app 的 SpinWheel，開轉放在輪盤正下方。
  業主點出的真正問題是「輪盤和開轉不在同一個畫面」，兩項其實是同一件事。
  - **原本不用 SpinWheel 的理由已經不成立**：`LandingWheel` 註解說它會把 ~1000 行放上入口的關鍵路徑，
    但 `App.tsx` 從 8 月起就**靜態** import WheelApp，SpinWheel 早就在入口 bundle 裡。
    換用後入口 110.37 → 110.31 KB gz（刪掉自製圓盤，零新增下載）
  - 組法照 GuestWheel（`/w/:id`，線上已跑）：SpinWheel → 開轉 → 候選 chip 與輸入框；結果用 `WinnerSurface`，
    「登入後保留你加的 N 家」放在結果裡。鏡頭推進時下方控制項整個淡出（同 WheelApp，半透明按鈕疊在輪盤上像壞掉）
  - 輪盤移出 `--paper` 卡片、直接放在 `--ground` 上：玻璃楔形在白卡上看不見（失敗模式 29）
  - 結果畫面 portal 到 `<body>`：`.reveal` 動畫結束留下 `matrix(1,0,0,1,0,0)`，實測放在裡面的
    `fixed inset-0` 只蓋 342×753，不是 390×844
  - **實測**（headless Chromium + CDP，開轉按鈕底部 / 視窗高）：390×844 中文 747/844、英文深色 785/844、
    1280×800 759/800、1440×900 784/900 — 都在首屏內。指針下的格子 = 公布的店（中英、深淺、reduced motion 都對）；
    加店、去重、移除、存草稿（只存自己輸入的）、導去登入都正常
  - ✅ **小手機**（業主同意壓縮文案，2026-09-23）：英文是瓶頸 — 標題在 44px 是 334px，375/360 的欄寬
    只有 327/312，折成兩行。改動：標題下限 2.75rem → 2.5rem（40px 時 304px，一行）；英文眉標
    `Free · Spin before you sign in`；副標收成一行（`Can't decide? Let the wheel pick.` /
    `選擇障礙？交給轉盤，10 秒決定午餐。`）；「改成你公司樓下的店」提示移到候選清單上方；
    視窗高 ≤ 700px 時標題區上下間距收緊。實測開轉底部：360×640 → 606/640、375×667 → 620/667、
    390×664（iPhone Safari 實際可視高度）→ 633/664，中英文相同；390×844、1280×800 仍在首屏內
- ✅ **預設語言改英文**（業主決定，2026-09-23）：沒選過 → 英文（不再看瀏覽器語言）；按過切換 → 存在
  `localStorage.lang`，之後每次都照它。只有使用者切換才會寫入，預設值不會被記成「選擇」。
  實測：中文瀏覽器第一次進來是英文且 storage 為空；切中文後存 `zh-TW`，重新整理仍是中文。
  **連帶影響**：first run 的 Places 語言跟著介面語言走（5a），所以沒切換的台灣使用者會拿到英文店名、
  新輪盤叫「Lunch near me」。`index.html` 的標題、描述、`lang` 仍是中文（爬蟲和分享預覽讀的是它），沒動
- → **5n** 未驗證

## 6. 2026-09-23 staging 回饋（業主手機實測）

- ✅ **6a 底部面板的標題列**：X 原本用絕對定位固定在 `top-4 right-4`，中心在 y=38；「我的輪盤」那一列因為 56px 高的「新增」
  中心在 y≈52，所以 X 高了 14px。改在 `ui/sheet.tsx`：底部面板的 X 放進 `SheetHeader` 那一列的最後，
  和標題、動作按鈕同一條中線（實測三者都在同一 y）。標題對齊面板內容：輪盤切換 24px（= 每列的輪盤圖示）、
  篩選 16px（= 面板 px-4，原本離邊緣只有 8px）；兩個面板的 X 都距右 16px（輪盤切換對齊每列的 ⋮）。
  其他由下往上的元件：店家詳情 Drawer 沒有 X、標題已有 20px 內距；WinnerSurface 沒有標題列；Dialog 都是置中彈窗
- ✅ **6b 輪盤字不置中**：≤ 8 家用兩行規格（band 34px、行高 16px），文字從框頂開始排，一行的店名只佔上半 —
  實測每個標籤的文字偏離楔形中線 7.9px（框本身 0），中英文都一樣。改成框 = 實際行數、以框中心對準中線。
  實測：一行 0px、兩行（-7 / +7）平均 0；9 家以上的單行規格前後都是 0.4px（對照組）。app 內的輪盤同一個元件，一起修好
- ⏸ **6c 結果畫面上半部很空**：是設計（鏡頭推進 + 結果出現時輪盤後退、blur 7px、0.72），app 和 `/w/:id` 一樣。
  首頁特別空，因為輪盤在 hero 下方、倍率只有 ~2x，淡色楔形模糊後在淡色底上幾乎看不見。三個版本已截圖給業主：
  A 維持、B 首頁不後退（看得到指針停在得獎格）、C 轉之前先捲動讓輪盤佔滿畫面。**等業主決定**
- 🔎 **6d Codex 的使用者測試**：原始檔（`lunch-ux-test-2026-09-23.zip`）不在 repo、GitHub issue/PR、Google Drive、Notion。
  唯一紀錄是第 5 節的分流。第 5 節仍未完成的：5n（帳號選單 aria-hidden 內可聚焦，未驗證）、axe 對比（標籤 chip
  2.5–3.1:1、步行時間灰字 3.92:1，設計決定）、5d 缺口（「我想自己加店」不帶首頁草稿）

## Changelog

- 2026-09-22 — 建立。來源：marketing / landing page 那一輪（P0 已 ship）+ onboarding
  第一次搜尋品質的討論。SEO 在 2a 之前暫停。
- 2026-09-22 — Onboarding 定案走提案 A。1b/1c/1d 依 wireframe 討論改寫：
  server 回 25 家、client 瞬間篩選、評分過濾。原 1c/1d 順延為 1e/1f。
- 2026-09-22 — 訂正 1b：「25 家不增加 API 呼叫」是錯的。Nearby Search 一頁上限 20，
  Distance Matrix 一個請求上限 25 — 兩個不同的數字被混在一起了。免費上限是 20。
- 2026-09-22 — 1f 完成（定位權限預先偵測）。三個瀏覽器行為用 CDP 實測，含
  change 事件的恢復路徑。新文案仍是英文，併入 3a。
- 2026-09-22 — 1a 實測（內湖）：兩份清單只重疊 2/20。prominence 確實藏住在地小店，
  但 distance 會撈進茶館與早餐店，所以不是單純換掉就好。1d 降優先度：
  40 家樣本裡沒有任何一家低於 3.0。
- 2026-09-22 — 1a 定案：採用 rankby=distance。第二次量測證明 types[] 分不出
  午餐與茶館／早餐店（17/20 分類完全相同），所以「distance + types 清理」作廢；
  改為接受雜訊，理由寫在 1a。另補 business_status 待接。
- 2026-09-22 — 1b/1c/1d 完成，1e 部分完成（按需要的下一頁）。訂正 1a：business_status
  早就有接（軟性），缺的是永久歇業的區分，已補。Onboarding 畫面同一輪重新設計
  （雷達 → 組裝 → 開轉），文案繁中優先、英文保留。
- 2026-09-23 — 加入第 5 節：staging 使用者測試的分流。新發現 5a（Places 沒送 language）是這次最大的問題。
  翻譯（3a）改由 Codex 在 `codex/i18n-app` 做，流程見 `docs/i18n/codex-flow.md`；字典已拆成 namespace 檔。
- 2026-09-23 — 3a 完成：Codex 的翻譯（PR #38）快轉進 Claude 分支後補完 — 系統標籤、步行／剩餘時間、評分、
  地圖錯誤訊息、`language` 參數、術語對齊；並修掉翻譯帶進來的「任何渲染錯誤 → 整頁空白」（ErrorBoundary 在 LangProvider 外）。
- 2026-09-23 — 5l（app 內其餘小標改墨色）、5m（`<main>` + h1）完成，實測對比與 axe。
- 2026-09-23 — 5f/5g 完成：首頁 demo 改用 SpinWheel、開轉在輪盤正下方（業主決定）。小手機（≤667 高）仍在首屏外，待決定。
- 2026-09-23 — 小手機解決（壓縮 hero 文案 + 矮螢幕收間距）；預設語言改英文，使用者的選擇存在 localStorage。
- 2026-09-23 — 第 6 節：staging 回饋。底部面板標題列、輪盤字置中完成；結果畫面上半部待業主決定。
