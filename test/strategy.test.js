import test from 'node:test';
import assert from 'node:assert/strict';
import { creditSignals, evaluateStock, rankCandidates, technicalSignals } from '../src/core/strategy.js';
import { bars, margin, stock } from './fixtures.js';

test('基本門檻與價格、法人、資券日期對齊後才具備入榜資格', () => {
  const item = stock();
  const result = evaluateStock(item);
  assert.equal(result.technical.baseGatePass, true);
  assert.equal(result.eligible, true);
  item.margin = item.margin.slice(0, -1);
  assert.equal(evaluateStock(item).eligible, false);
});

test('20日均量必須嚴格大於1000張', () => {
  assert.equal(technicalSignals(bars({ volumeLots: 1000, volumeShares: 1_000_000 })).baseGatePass, false);
});

test('36月營收創高取得12分且年增為正再取得3分', () => {
  const result = evaluateStock(stock());
  assert.equal(result.revenue.revenue36mHigh, true);
  assert.equal(result.scoreBreakdown.revenue, 15);
  assert.equal(result.grade, 'A');
  assert.equal(result.candidateStatus, 'VERIFIED');
});

test('營收或TDCC不足仍可列暫定榜，不冒充已驗證', () => {
  const noRevenue = evaluateStock(stock({ monthlyRevenue: [] }));
  assert.equal(noRevenue.candidateStatus, 'PROVISIONAL');
  assert.equal(noRevenue.scoreBreakdown.revenue, 0);
  const shortTdcc = evaluateStock(stock({ tdccWeeks: stock().tdccWeeks.slice(-1) }));
  assert.equal(shortTdcc.candidateStatus, 'PROVISIONAL');
  assert.equal(shortTdcc.scoreDenominator, 75);
});

test('融資五日增加超過10%扣10分', () => {
  const item = stock();
  item.margin = item.margin.map((row, index, all) => ({ ...row, marginBalance: index === all.length - 1 ? 12_000 : 10_000 }));
  const result = evaluateStock(item);
  assert.equal(result.scoreBreakdown.penalties, -10);
  assert.match(result.riskReasons.join(), /融資五日/);
});

test('排行榜最多20檔且同分時營收創高優先', () => {
  const rows = Array.from({ length: 22 }, (_, index) => stock({ symbol: String(1000 + index) }));
  rows[11].monthlyRevenue = [];
  const ranked = rankCandidates(rows);
  assert.equal(ranked.length, 20);
  assert.equal(ranked[0].revenue.revenue36mHigh, true);
});

test('券資比處理零分母及30%、50%數值', () => {
  assert.equal(creditSignals([{ date: '2026-09-04', marginBalance: 0, shortBalance: 10 }]).shortToMarginRatio, null);
  assert.equal(creditSignals(margin(bars().slice(-21), 0.3)).shortToMarginRatio, 0.3);
  assert.equal(creditSignals(margin(bars().slice(-21), 0.5)).shortToMarginRatio, 0.5);
});
