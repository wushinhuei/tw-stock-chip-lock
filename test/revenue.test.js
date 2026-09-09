import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRevenueRows, revenueSignals } from '../src/core/revenue.js';

function months(count = 36) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2023, 8 + index, 1));
    return { symbol: '2330', yearMonth: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, revenue: 100 + index, downloadedAt: '2026-09-01T00:00:00Z', availableAt: '2026-09-01T00:00:00Z', rawHash: `h${index}` };
  });
}

test('連續36月且最新值嚴格高於前35月才是新高', () => {
  assert.equal(revenueSignals(months(), { asOf: '2026-09-02T00:00:00Z' }).revenue36mHigh, true);
  const equal = months();
  equal.at(-1).revenue = equal.at(-2).revenue;
  assert.equal(revenueSignals(equal, { asOf: '2026-09-02T00:00:00Z' }).revenue36mHigh, false);
});

test('缺月與尚未發布資料不會誤判完整', () => {
  assert.equal(revenueSignals(months().filter((_, index) => index !== 12)).revenueDataStatus, 'REVENUE_INCOMPLETE');
  const future = months();
  future.at(-1).availableAt = '2026-10-01T00:00:00Z';
  assert.equal(revenueSignals(future, { asOf: '2026-09-02T00:00:00Z' }).validMonths, 35);
});

test('更正申報以較新下載版本覆蓋並保留修訂雜湊', () => {
  const original = { ...months(1)[0], revenue: 100, rawHash: 'old' };
  const corrected = { ...original, revenue: 120, rawHash: 'new', downloadedAt: '2026-09-02T00:00:00Z' };
  const merged = mergeRevenueRows([original], [corrected]);
  assert.equal(merged[0].revenue, 120);
  assert.deepEqual(merged[0].revisions.map(row => row.rawHash), ['old', 'new']);
});
