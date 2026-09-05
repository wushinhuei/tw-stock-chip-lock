# tw-stock-chip-lock

獨立於 `tw-stock-bot` 的台股籌碼共振選股工具。它只做資料整理、候選篩選、人工複核、瀏覽器警示與向前績效紀錄，不連券商 API，也不自動下單。

## 資料完整性結論

整體資料只能標示為「部分完整」。TWSE 日線、法人與融資融券，以及 MOPS 公司資料可自動更新；TDCC 千張大戶歷史有限，需要由本專案逐週累積；券商分點與隔日沖分類必須人工補充；真實融資維持率不是公開市場資料，本專案只提供明確標為 `estimated` 的壓力代理值。

只有輸出狀態為 `COMPLETE` 時，頁面才會允許新的進場或加碼警示。

## 策略摘要

1. 第一層：20 日均量大於 1,000 張、價格高於 MA20/MA60，且兩條均線向上。
2. 第二層：千張大戶連增且股東人數連降，並符合法人連買與五日集中度門檻。
3. 第三層：人工檢查分點、平台、上影線、高檔滯漲及 MOPS 事件，最多核准三檔。
4. 建倉：突破 15%、拉回確認加 10%、主升/軋空確認加 5%。單檔最高 30%，保留至少 10% 現金。

完整公式與資料欄位見 `docs/strategy.md` 與 `docs/data-completeness.md`。

## 本機驗證

```powershell
npm.cmd test
npm.cmd run check
```

## 更新

```powershell
npm.cmd run update:weekly
npm.cmd run update:daily
npm.cmd run backtest
```

更新器採 fail-closed。官方來源缺漏或日期未對齊時仍會產生 manifest，但不會產生可交易訊號。

首次長批次採官方 `wwwc.twse.com.tw` 端點、1.1 秒間隔與 403/429 冷卻；成功日期會寫入本機快取，重跑時只補缺日。回測在一年官方價格、有效交易與 0050 基準不足時輸出 `BLOCKED`，不產生假績效。

頁面同時提供 JSON 與離線 JavaScript 資料包；可直接雙擊 `web/index.html`，不會因 `file://` 阻擋 JSON `fetch` 而停在讀取畫面。

## 外部發布邊界

建立 GitHub repository、推送、啟用 Pages、設定 Worker secrets 或部署 Cloudflare Worker 都是外部寫入，必須在執行當下另外確認。任何 token 不得寫入 repository。
