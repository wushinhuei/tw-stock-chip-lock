import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidateOutcomes, recordCandidates } from '../src/core/outcomes.js';

test('入榜紀錄去重並只計算入榜後的5、10、20日表現', () => {
  const candidate = { symbol: '2330', name: '台積電', grade: 'A', score: 88, candidateStatus: 'VERIFIED', technical: { close: 100 }, revenue: { revenue36mHigh: true } };
  const observations = recordCandidates(recordCandidates([], [candidate], '2026-01-01'), [candidate], '2026-01-01');
  assert.equal(observations.length, 1);
  const prices = [];
  for (let day = 1; day <= 21; day += 1) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    prices.push({ symbol: '2330', date, close: 100 + day - 1 }, { symbol: '0050', date, close: 50 + (day - 1) / 2 });
  }
  const result = evaluateCandidateOutcomes(observations, prices);
  assert.equal(result.observations[0].horizons[5].return, 0.05);
  assert.equal(result.observations[0].status, 'COMPLETE');
  assert.equal(result.summary.groups.A.count, 1);
});
