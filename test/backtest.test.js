import test from 'node:test';
import assert from 'node:assert/strict';
import { maximumDrawdown, runMechanicalProxy } from '../src/core/backtest.js';

test('回測資料不完整時禁止產生績效', () => {
  assert.equal(runMechanicalProxy({ dataStatus: 'PARTIAL' }).status, 'BLOCKED');
});

test('回測計入成本並誠實比較0050', () => {
  const result = runMechanicalProxy({
    dataStatus: 'COMPLETE', costRate: 0.01,
    trades: [{ entryDate: '2026-01-01', exitDate: '2026-02-01', entryPrice: 100, exitPrice: 110 }],
    benchmarkBars: [{ close: 100 }, { close: 120 }]
  });
  assert.equal(result.status, 'COMPLETE');
  assert.ok(Math.abs(result.strategyReturn - 0.09) < 1e-12);
  assert.ok(Math.abs(result.benchmarkReturn - 0.19) < 1e-12);
  assert.equal(result.beatBenchmark, false);
  assert.ok(result.caveat.includes('人工分點'));
});

test('最大回撤計算', () => {
  assert.ok(Math.abs(maximumDrawdown([1, 1.2, 0.9, 1.1]) - (-0.25)) < 1e-12);
});
