import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, coverage, evaluateCompleteness } from '../src/core/completeness.js';

const date = '2026-09-04';
const required = {
  prices: { ok: true, date, rows: 100 }, institutional: { ok: true, date, rows: 100 },
  margin: { ok: true, date, rows: 100 }, tdcc: { ok: true, date: '2026-08-28', rows: 100 }
};

test('完整、部分、阻擋及過期四種狀態均fail-closed', () => {
  assert.equal(evaluateCompleteness(required, { expectedDate: date }).status, 'COMPLETE');
  const partial = evaluateCompleteness({ ...required, mops: { ok: false, date: null, rows: 0 } }, { expectedDate: date });
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(partial.allowNewRisk, false);
  assert.equal(evaluateCompleteness({ ...required, margin: { ok: false, date, rows: 0 } }, { expectedDate: date }).status, 'BLOCKED');
  assert.equal(evaluateCompleteness({ ...required, prices: { ...required.prices, date: '2026-09-03' } }, { expectedDate: date }).status, 'BLOCKED');
  assert.equal(evaluateCompleteness({ ...required, prices: { ...required.prices, stale: true } }, { expectedDate: date }).status, 'STALE');
});

test('manifest記錄來源、日期、缺漏與穩定雜湊', () => {
  const completeness = evaluateCompleteness(required, { expectedDate: date, now: '2026-09-05T00:00:00Z' });
  const one = buildManifest({ sources: required, completeness, payload: { a: 1 }, generatedAt: '2026-09-05T00:00:00Z' });
  const two = buildManifest({ sources: required, completeness, payload: { a: 1 }, generatedAt: '2026-09-05T00:00:00Z' });
  assert.equal(one.payloadSha256, two.payloadSha256);
  assert.equal(one.payloadSha256.length, 64);
  assert.equal(one.sourceDates.margin, date);
});

test('來源覆蓋率按不同交易日計算而非總筆數', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ date: index < 500 ? '2026-09-03' : '2026-09-04' }));
  assert.deepEqual(coverage(rows, 5), { dates: 2, minimumDates: 5, sufficient: false });
});
