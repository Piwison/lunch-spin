# 翻譯術語表 · i18n glossary

The Traditional Chinese the landing page and first run already ship with. Any new
translation uses these words so the app reads as one product. When a term is not
here, pick one, use it everywhere, and add it here in the same commit.

## 語氣 · Voice

- 稱呼用「你」，不用「您」。像同事之間講話，不是客服公告。
- 全形標點：，。？！「」、（）…… 英文、數字、`$` 前後留半形空格：`附近 20 家`、`步行 5 分鐘`、`$$ 以下`。
- 讀取中用「…」結尾：`轉動中…`、`定位中…`。
- 按鈕用動詞開頭、盡量短：`開轉`、`再轉一次`、`換地點`、`加入`。
- 驚嘆號省著用。錯誤訊息說**發生什麼 + 怎麼辦**，不道歉兩次。
- 品牌字「Lunch Wheel」在頁首 logo 旁保持英文；句子裡講產品用「午餐轉盤」或直接說「輪盤」。

## 名詞 · Nouns

| English (in the code today) | 繁中 | 說明 |
|---|---|---|
| wheel | 輪盤 | 不用「轉盤」混用；「轉盤」只出現在 landing 標題的品牌語境 |
| restaurant / place | 店、店家 | 句子裡用「店」（`加一家店`）；列表標題可用「店家」 |
| candidates (on this round) | 候選 | `這輪的候選` |
| in play (hub count) | 可轉 | 輪盤中心：`6 家可轉` |
| on the wheel | 在輪盤上 | `6 家在輪盤上` |
| member | 成員 | |
| owner | 建立者 | 不用「擁有者」 |
| team wheel / shared wheel | 團隊輪盤 | |
| public wheel | 公開輪盤 | |
| guest | 訪客 | |
| invite link | 邀請連結 | |
| default wheel | 預設輪盤 | |
| round | 這一輪 | veto / vote 都屬於「這一輪」 |
| veto | 否決 | `否決這家`、`收回否決` |
| vote | 投票 | `投給這家`、`收回投票` |
| dietary (avoid) | 忌口 | `這輪忌口：素食` |
| tag | 標籤 | |
| cuisine | 料理類型 | tag 分類名 |
| food type | 餐點類型 | tag 分類名 |
| filter | 篩選 | |
| history | 紀錄 | tab 名稱 |
| stats | 統計 | |
| taste profile | 口味輪廓 | |
| rating (team, 1–5) | 評分 | Google 評分也叫評分；需要區分時寫「Google 評分」/「團隊評分」 |
| reviews (count) | 則評論 | `(1,062)` 不翻；文字時 `280 則評論` |
| walk time | 步行時間 | `步行 5 分鐘`；估算：`步行約 5 分鐘` |
| open now / closed now | 營業中 / 休息中 | 不用「打烊」表示暫時休息 |
| closing soon | 快打烊 | |
| exclusion / excluded | 最近吃過，暫時跳過 | 不直接用「排除」—使用者看到的是結果不是機制 |
| re-enable | 放回輪盤 | |
| exclusion days | 幾天內不重複 | 設定項 |
| fairness mode | 公平模式 | |
| rotate cuisines | 輪流換口味 | |
| settings | 設定 | |
| account | 帳號 | |
| a spin (the record) / spins | 抽選 / 次抽選 | `抽選紀錄`、`3 次抽選`、`總抽選次數`。按鈕仍是「開轉」 |
| picked (by the wheel) | 抽到、抽中 | `最常抽到`、`昨天抽到`、`{name} 抽到「台記」` |
| seeded tags (Japanese, Noodles…) | 日式、麵食… | 只翻顯示，存的值維持英文：`places.tagName.*` + `client/src/lib/tagLabel.ts` |
| Office (default walk origin) | 公司 | 同上，是存進資料庫的預設值，只翻顯示 |
| Google Maps | Google 地圖 | 產品名在中文句子裡寫「Google 地圖」 |

## 動作 · Actions

| English | 繁中 |
|---|---|
| Spin / Spin the wheel | 開轉 |
| Spinning… | 轉動中… |
| Spin again | 再轉一次 |
| Lock it in / accept | 就吃這家 |
| Today it's… (result eyebrow) | 今天就吃 |
| Create wheel / New wheel | 建立輪盤 / 新輪盤 |
| Save / Save changes | 儲存 / 儲存變更 |
| Remove | 移除 |
| Delete wheel | 刪除輪盤 |
| Leave wheel | 退出輪盤 |
| Share | 分享 |
| Copy link | 複製連結 |
| Retry | 再試一次 |
| Sign in / Sign out | 登入 / 登出 |
| Delete account | 刪除帳號 |
| Use my location | 用我現在的位置 |
| Look farther / Widen the search | 找遠一點 |

## 不翻的東西 · Leave as-is

- 餐廳名稱、使用者輸入的任何文字、輪盤名稱（資料，不是 UI）。
- 價位 `$`–`$$$$`、評分數字、`(1,062)` 評論數格式。
- 資料庫裡的 tag 值（見 `client/src/i18n/messages/README.md` 規則 5：只翻顯示，不改存的值）。
