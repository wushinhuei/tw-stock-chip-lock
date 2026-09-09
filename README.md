# tw-stock-chip-lock

獨立於 `tw-stock-bot` 的台股潛力股雷達。系統以 TWSE、MOPS 與 TDCC 資料尋找籌碼集中、均線轉多、接近頸線且尚未明顯大漲的上市普通股；只提供研究排行榜與向前觀察，不管理資金或部位，也不連接券商 API。

## 資料完整性

整體只能標示為「部分完整」：TWSE 價格、法人、融資融券與 MOPS 月營收可自動更新；TDCC 歷史須逐週累積；券商分點、隔日沖與 K 線風險需人工補充。核心市場資料缺漏時標示 `UNAVAILABLE` 且不產生榜單；TDCC、36 個月營收或人工資料不足時仍可產生 `PROVISIONAL` 暫定榜。

## 排名概要

- 基本門檻：120 個交易日、20 日均量大於 1,000 張、`收盤 > MA20 > MA60`、兩條均線上升、距 60 日頸線 -10% 至 +2%、20 日漲幅不超過 30%。
- 100 分評分：大戶 25、法人 25、技術蓄勢 25、月營收 15、資券 5、流動性 5。
- 最新單月營收嚴格高於前 35 個月最高值加 12 分；年增為正再加 3 分。
- A 級 80 分以上、B 級 65–79、C 級 50–64；最多 20 檔，不降低門檻湊數。

詳見 [策略規格](docs/strategy.md) 與 [資料完整性](docs/data-completeness.md)。

## 本機使用

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run update:weekly
npm.cmd run validate:output
```

更新會產生 `web/data/latest.json`、離線 JavaScript 資料包及 `web/data/outcomes.json`。可直接雙擊 `web/index.html` 檢視，不依賴 `file://` JSON fetch。

## MCP 研究工具

- `get_potential_stocks`
- `get_candidate_snapshot`
- `get_data_completeness`

GitHub repository、推送、Pages、Secrets 與 Cloudflare Worker 部署屬外部寫入，需於實際執行前另行取得授權。
