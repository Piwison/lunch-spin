# Replica：本機的 staging 複本

2026-09-24 走查用的整套工具（`docs/user-tests/2026-09-24-walkthrough.md`）。
實作計畫（`docs/plans/2026-09-24-walkthrough-plan.md`）裡的驗收步驟 R1–R3 都在這裡跑。

**它是什麼**：真的程式碼、真的 migration，加上：

- **MariaDB**：本機的，所有 migration 都有套用
- **假的 Google Places**：內湖瑞光路附近 28 家店，有意放了雜訊（`fixture.mjs`）
- **對齊的假時鐘**：預設 2026-09-24（四）12:05 台北
- **瀏覽器驅動**：五個人物，一人一個 cookie jar

**它不是什麼**：它不是 staging。和 staging 已知的差異（失敗模式 70），每一個都曾經製造出一個看起來很真的 bug：

| 差異 | 怎麼處理 |
|---|---|
| MariaDB 把 JSON 存成 LONGTEXT，TiDB 回傳物件 | `mariadb-json.mjs` preload 補上解析 |
| server、DB、瀏覽器三個時鐘 | 都從 DB 的 `NOW()` 對齊（`db.sh` → `server.sh`、`drv.mjs`） |
| http：`SameSite=None` 沒有 `Secure`，登入、登出的 cookie 會被 Chrome 丟掉 | 不用真的登入：`seed.mjs` 直接簽 session，驅動設 cookie（要用 `url:`，不能用 `domain:`） |
| Google 登入畫面 | 不走；只有 staging 能測 |
| 真的 Google 資料品質（例如很多小店其實沒有英文名） | 假資料每家都有中英文名，所以「英文店名」這類問題在這裡會被放大 |

看到「bug」的時候先問：staging 上哪個元件會造成一樣的症狀？答不出來，就是這個複本的問題。

## 一次性安裝（web 容器或 Linux）

```bash
apt-get update && apt-get install -y mariadb-server faketime
```

瀏覽器用 `/opt/pw-browsers/chromium_headless_shell-*`（web 容器已經有）。不要用 Playwright MCP（失敗模式 68）。

## 啟動

```bash
bash scripts/replica/db.sh                  # MariaDB，在假時鐘上；已經在跑就跳過
node scripts/replica/seed.mjs --reset       # 清空、跑 migration、塞 R3 的資料、簽 session（只對 127.0.0.1）
bash scripts/replica/server.sh > scripts/replica/.state/dev.log 2>&1 &   # dev server（tsx watch，改程式會 reload）
node scripts/replica/drv.mjs > scripts/replica/.state/drv.log 2>&1 &     # 瀏覽器驅動
```

**換時間**：`REPLICA_TIME="2026-09-24 04:20:00"`（UTC）。要先停掉 `mariadbd` 再跑 `db.sh`，
然後重跑 `server.sh`、`drv.mjs`，因為三個都只在啟動時讀一次時鐘。

**狀態、log、截圖**：全部在 `scripts/replica/.state/`（已經 gitignore）：

- `google-calls.log`：server 實際跟 Google 要了什麼
- `tokens.json`：四個人的 session
- `shots/`：截圖

## 人物

| 人物 | 是誰 | 用在 |
|---|---|---|
| `amy` | Amy Chen，輪盤擁有者 | R2、R3 |
| `ben` | Ben Lin，成員 | R2 |
| `chloe`、`dan` | 還沒有任何輪盤的新帳號 | R1 |
| `guest` | 沒登入 | 首頁、`/w/1` |

## 驅動指令

`node scripts/replica/b.mjs <指令> [參數]`，多個指令用單獨的 `\;` 串起來。

| 指令 | 作用 |
|---|---|
| `use <人物>` | 切換人物 |
| `goto <path>`、`reload` | 開頁面 |
| `click <文字或 /regex/> [第幾個]` | 依文字、`aria-label`、`placeholder` 找元素，捲到畫面中間，用**觸控**點下去。回報實際點到什麼；被別的元素蓋住會標 `COVERED BY` |
| `exact <文字>` | 文字完全相同才算 |
| `at <x> <y>` | 點座標 |
| `fill <欄位> <文字>`、`type <文字>`、`key Enter\|Escape\|Home` | 輸入 |
| `text [最多幾字]` | 畫面上看得到的文字：`[按鈕]`、`<連結>`、`{輸入框}`、`(on)`／`(off)` |
| `shot <名字> [full]` | 截圖到 `.state/shots/` |
| `eval <js>` | 在頁面裡執行 |
| `net`、`errors` | 上次查看之後的 API 請求、console 錯誤 |
| `geo deny\|prompt\|grant` | 定位權限 |
| `size <w> <h>` | 視窗大小，預設 390×844 |
| `storage [key value]`、`clearstorage`、`login <人物>`、`logout`、`cookies` | 狀態 |

UI 的文字會套 `text-transform`，所以 `innerText` 拿到的可能是全大寫（例如 `TEAM · 2`），比對時用 `/team/i`。

## 驗收腳本

### R1 新使用者（首次設定）

```bash
node scripts/replica/b.mjs use guest \; goto / \; click "Remove Pizza" \; fill "Add a place" 這家炒飯 \; key Enter \
  \; click "/^Spin$/" \; wait 6000 \; click "Sign in and keep" \; login chloe \; goto / \; text 1500
node scripts/replica/b.mjs click "Use my location" \; wait 3000 \; text 3000 \; shot first-run
```

拒絕定位的路線：先 `geo deny`；手動建立的路線：用 `dan`，按「I'll add places myself」。

### R2 團隊的一天（Amy + Ben，R3 的資料）

```bash
node scripts/replica/b.mjs use amy \; goto /app \; text 1200          # Skipping 名單現在是 1 家
node scripts/replica/b.mjs use ben \; goto /app \; click "Spin the wheel" \; use amy \; wait 1500 \; text 400 \
  \; use ben \; wait 5500 \; text 600
```

第二行的用意：Ben 按開轉之後 1.5 秒，看 Amy 的畫面有沒有提前出現 toast（報告 P0-D；A4 修好之後就不應該有）。

### R3 三週紀錄

```bash
node scripts/replica/b.mjs use amy \; goto /app \; click "/^History$/" \; wait 1500 \; text 6000 \; shot history full
```

資料是固定的：9/3–9/23 共 15 個工作天、20 次轉動（含重轉）、9 個評分。
Amy 每天轉到哪一家，和報告裡的截圖一致。

## 檔案

| 檔案 | 內容 |
|---|---|
| `fixture.mjs` | 28 家店、辦公室座標、營業時間、距離公式；假 Google 和種子資料共用 |
| `fake-google.mjs` | preload：Nearby / Text / Find Place / Details / Distance Matrix |
| `mariadb-json.mjs` | preload：JSON 欄位解析（只有 MariaDB 需要） |
| `env.sh` | 共用設定；`DATABASE_URL` 不是 localhost 就直接停 |
| `db.sh`、`server.sh` | MariaDB 和 dev server，時鐘對齊 |
| `seed.mjs` | 重建資料庫 + R3 資料 + session |
| `drv.mjs`、`b.mjs` | 瀏覽器驅動與它的 client |
