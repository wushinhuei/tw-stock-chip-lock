import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExitAction, applyStage, canAdvanceStage, evaluateStageConditions, exitDecision } from '../src/core/portfolio.js';

const completeness = { status: 'COMPLETE', allowNewRisk: true };
const passed = { passed: true, reasons: [] };

test('15%+10%+5%只能依序一次且同股不重複', () => {
  let positions = [];
  for (const targetStage of [1, 2, 3]) {
    const result = applyStage({ positions, symbol: '2330', targetStage, completeness, conditions: passed });
    assert.equal(result.applied, true);
    positions = result.positions;
  }
  assert.equal(positions.length, 1);
  assert.equal(positions[0].allocationPct, 0.30);
  assert.equal(canAdvanceStage({ positions, symbol: '2330', targetStage: 3, completeness, conditions: passed }).allowed, false);
});

test('最多三檔、保留10%現金且減碼後不得補回', () => {
  const three = ['1101', '1102', '1103'].map(symbol => ({ symbol, stage: 3, allocationPct: 0.30, reduced: false }));
  assert.equal(canAdvanceStage({ positions: three, symbol: '1104', targetStage: 1, completeness, conditions: passed }).allowed, false);
  const reduced = applyExitAction([{ symbol: '2330', stage: 2, allocationPct: 0.25 }], '2330', 'REDUCE_HALF');
  assert.equal(reduced[0].allocationPct, 0.125);
  assert.equal(canAdvanceStage({ positions: reduced, symbol: '2330', targetStage: 3, completeness, conditions: passed }).allowed, false);
});

test('三階段條件各自驗證', () => {
  const candidate = {
    technical: { bullishAlignment: true, close: 100, ma10: 100, ma20: 99, prior60High: 98, closeAboveMa5: true, ma5Rising3: true },
    institutional: { simultaneousBuy3d: true, trustSellStreak: 0, latestInstitutionalPositive: true },
    holders: { latestLargeHolderChange: 0.01 }, credit: { marginIncreased: true, shortToMarginRatio: 0.30 }
  };
  assert.equal(evaluateStageConditions({ targetStage: 1, candidate, breakout: { triggered: true } }).passed, true);
  assert.equal(evaluateStageConditions({ targetStage: 2, candidate, review: { neckline: 98, volumeContracted: true } }).passed, true);
  assert.equal(evaluateStageConditions({ targetStage: 3, candidate }).passed, true);
  assert.equal(evaluateStageConditions({ targetStage: 3, candidate: { ...candidate, credit: { shortToMarginRatio: 0.2999 } } }).passed, false);
});

test('賣出規則涵蓋破頸線、投信連賣、籌碼渙散與軋空反轉', () => {
  const base = { technical: { close: 90, ma20: 95, ma5: 96, prior60High: 100 }, institutional: {}, holders: {}, credit: {} };
  assert.equal(exitDecision({ position: { stage: 1 }, candidate: base, review: {} }).action, 'EXIT_ALL');
  assert.equal(exitDecision({ position: { stage: 1 }, candidate: { ...base, technical: { ...base.technical, close: 101 }, institutional: { trustSellStreak: 2 } }, review: {} }).action, 'REDUCE_HALF');
  const distribution = { ...base, technical: { ...base.technical, close: 101 }, holders: { distributionTwoWeeks: true, latestHolderCountChange: 0.05 } };
  assert.equal(exitDecision({ position: { stage: 1 }, candidate: distribution, review: {} }).action, 'REDUCE_HALF');
  const squeeze = { ...base, technical: { ...base.technical, close: 130, ma20Deviation: 0.21, latestVolume120High: true }, credit: { shortToMarginRatio: 0.30 } };
  assert.equal(exitDecision({ position: { stage: 3 }, candidate: squeeze, review: { longUpperShadow: true } }).action, 'EXIT_ALL');
});
