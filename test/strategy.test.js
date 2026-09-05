import test from 'node:test';
import assert from 'node:assert/strict';
import { breakoutSignal, creditSignals, evaluateStock, projectedDayVolume, rankCandidates, technicalSignals } from '../src/core/strategy.js';
import { bars, margin, stock } from './fixtures.js';

test('第一、二層全部通過才入選', () => {
  const result = evaluateStock(stock());
  assert.equal(result.technical.trendPass, true);
  assert.equal(result.holders.accumulationPass, true);
  assert.equal(result.institutional.selectionPass, true);
  assert.equal(result.selected, true);
});

test('個股價格、法人或資券未對齊最新交易日即剔除', () => {
  const item = stock({ expectedDate: bars().at(-1).date });
  assert.equal(evaluateStock(item).selected, true);
  item.margin = item.margin.slice(0, -1);
  assert.equal(evaluateStock(item).sourceAlignmentPass, false);
  assert.equal(evaluateStock(item).selected, false);
});

test('流動性與法人集中度採嚴格大於門檻', () => {
  const exactVolume = bars({ volumeLots: 1000, volumeShares: 1_000_000 });
  assert.equal(technicalSignals(exactVolume).trendPass, false);
  const exactConcentration = stock({
    institutional: exactVolume.slice(-5).map(row => ({ date: row.date, foreignNet: 50_000, trustNet: 50_000 })),
    bars: exactVolume.map(row => ({ ...row, volumeLots: 1500, volumeShares: 1_000_000 }))
  });
  assert.equal(evaluateStock(exactConcentration).institutional.concentration5d, 0.1);
  assert.equal(evaluateStock(exactConcentration).selected, false);
});

test('排序依法人集中度優先且最多20檔', () => {
  const rows = Array.from({ length: 25 }, (_, index) => {
    const item = stock({ symbol: String(1000 + index) });
    item.institutional = item.institutional.map(row => ({ ...row, symbol: item.symbol, foreignNet: 100_000 + index * 10_000 }));
    item.tdccWeeks = item.tdccWeeks.map(row => ({ ...row, symbol: item.symbol }));
    item.margin = item.margin.map(row => ({ ...row, symbol: item.symbol }));
    return item;
  });
  const ranked = rankCandidates(rows);
  assert.equal(ranked.length, 20);
  assert.equal(ranked[0].symbol, '1024');
});

test('券資比處理零分母及30%、50%邊界', () => {
  const stockBars = bars();
  const zero = creditSignals([{ date: stockBars.at(-1).date, marginBalance: 0, shortBalance: 10 }], stockBars);
  assert.equal(zero.shortToMarginRatio, null);
  assert.equal(zero.squeezeLevel, 'UNKNOWN');
  assert.equal(creditSignals(margin(stockBars.slice(-21), 0.3), stockBars).squeezeLevel, 'WATCH');
  assert.equal(creditSignals(margin(stockBars.slice(-21), 0.5), stockBars).squeezeLevel, 'EXTREME');
  assert.equal(creditSignals(margin(stockBars.slice(-21), 0.5), stockBars).estimateLabel, 'estimated');
});

test('09:30前不估量，過期報價與非COMPLETE皆禁止訊號', () => {
  assert.equal(projectedDayVolume(1000, '09:29'), null);
  const candidate = evaluateStock(stock());
  const now = '2026-09-04T10:00:00+08:00';
  const base = { candidate, review: { approved: true, neckline: 70 }, quote: { price: 80, cumulativeVolumeLots: 2000, timestamp: now }, time: '10:00', dataStatus: 'COMPLETE', now };
  assert.equal(breakoutSignal(base).triggered, true);
  assert.equal(breakoutSignal({ ...base, dataStatus: 'PARTIAL' }).triggered, false);
  assert.match(breakoutSignal({ ...base, quote: { ...base.quote, timestamp: '2026-09-04T09:57:00+08:00' } }).reasons.join(), /報價過期/);
});
