import { finite } from './math.js';

export const STAGE_ALLOCATIONS = Object.freeze([0.15, 0.10, 0.05]);

export function portfolioExposure(positions) {
  return positions.reduce((sum, position) => sum + (finite(position.allocationPct) ?? 0), 0);
}

export function canAdvanceStage({ positions, symbol, targetStage, completeness, conditions }) {
  const position = positions.find(row => row.symbol === symbol);
  const currentStage = position?.stage || 0;
  const reasons = [];
  if (completeness?.status !== 'COMPLETE' || !completeness.allowNewRisk) reasons.push('資料完整性禁止新增風險');
  if (targetStage !== currentStage + 1 || targetStage < 1 || targetStage > 3) reasons.push('階段順序不正確');
  if (targetStage === 1 && !position && positions.filter(row => (row.allocationPct || 0) > 0).length >= 3) reasons.push('已達三檔上限');
  if (!conditions?.passed) reasons.push(...(conditions?.reasons || ['階段條件未通過']));
  const add = STAGE_ALLOCATIONS[targetStage - 1] || 0;
  const existing = finite(position?.allocationPct) ?? 0;
  if (existing + add > 0.30 + Number.EPSILON) reasons.push('超過單檔30%');
  if (portfolioExposure(positions) + add > 0.90 + Number.EPSILON) reasons.push('現金將低於10%');
  if (position?.reduced) reasons.push('已減碼部位不得補回');
  return { allowed: reasons.length === 0, reasons, addAllocationPct: add, resultingAllocationPct: existing + add };
}

export function evaluateStageConditions({ targetStage, candidate, review = {}, breakout = null }) {
  const reasons = [];
  const technical = candidate?.technical || {};
  const institutional = candidate?.institutional || {};
  const holders = candidate?.holders || {};
  const credit = candidate?.credit || {};
  const close = finite(technical.close);
  const neckline = finite(review.neckline) ?? finite(technical.prior60High);

  if (targetStage === 1) {
    if (!technical.bullishAlignment) reasons.push('MA5、MA20、MA60未呈多頭排列');
    if (!institutional.simultaneousBuy3d) reasons.push('外資與投信未同步連買3日');
    if (!credit.marginIncreased) reasons.push('前一日融資未增加');
    if (!breakout?.triggered) reasons.push(...(breakout?.reasons || ['盤中突破尚未觸發']));
  } else if (targetStage === 2) {
    const ma10 = finite(technical.ma10);
    const ma20 = finite(technical.ma20);
    const near = [ma10, ma20].some(ma => ma !== null && close !== null && Math.abs(close / ma - 1) <= 0.02);
    if (!near) reasons.push('未回測MA10或MA20上下2%');
    if (close === null || neckline === null || close < neckline || (ma10 !== null && close < ma10 && ma20 !== null && close < ma20)) reasons.push('收盤未同時守住頸線與回測均線');
    if (!review.volumeContracted) reasons.push('回測未量縮');
    if ((holders.latestLargeHolderChange ?? -Infinity) < 0) reasons.push('千張大戶持股減少');
    if ((institutional.trustSellStreak || 0) >= 2) reasons.push('投信已連賣2日');
  } else if (targetStage === 3) {
    if ((credit.shortToMarginRatio ?? 0) < 0.30) reasons.push('券資比未達30%');
    if (!technical.closeAboveMa5) reasons.push('收盤未站上MA5');
    if (!technical.ma5Rising3) reasons.push('MA5未連升3日');
    if (!institutional.latestInstitutionalPositive) reasons.push('法人未偏多');
    if (review.sellSignal) reasons.push('存在賣出訊號');
  } else {
    reasons.push('未知建倉階段');
  }
  return { passed: reasons.length === 0, reasons };
}

export function applyStage({ positions, symbol, targetStage, completeness, conditions }) {
  const decision = canAdvanceStage({ positions, symbol, targetStage, completeness, conditions });
  if (!decision.allowed) return { applied: false, positions, decision };
  const current = positions.find(row => row.symbol === symbol);
  const next = current
    ? positions.map(row => row.symbol === symbol ? { ...row, stage: targetStage, allocationPct: decision.resultingAllocationPct } : row)
    : [...positions, { symbol, stage: targetStage, allocationPct: decision.resultingAllocationPct, reduced: false }];
  return { applied: true, positions: next, decision };
}

export function applyExitAction(positions, symbol, action) {
  if (action === 'EXIT_ALL') return positions.filter(row => row.symbol !== symbol);
  if (action === 'REDUCE_HALF') return positions.map(row => row.symbol === symbol
    ? { ...row, allocationPct: (finite(row.allocationPct) ?? 0) / 2, reduced: true }
    : row);
  return positions;
}

export function exitDecision({ position, candidate, review }) {
  const close = finite(candidate?.technical?.close);
  const neckline = finite(review?.neckline) ?? finite(candidate?.technical?.prior60High);
  const ma20 = finite(candidate?.technical?.ma20);
  const ma5 = finite(candidate?.technical?.ma5);
  const reasons = [];
  let action = 'HOLD';

  if (close !== null && neckline !== null && ma20 !== null && close < neckline && close < ma20) {
    return { action: 'EXIT_ALL', reason: '收盤同時跌破頸線與MA20' };
  }
  if ((candidate?.institutional?.trustSellStreak || 0) >= 3) return { action: 'EXIT_ALL', reason: '投信連續賣超3日' };
  if ((candidate?.institutional?.trustSellStreak || 0) >= 2) { action = 'REDUCE_HALF'; reasons.push('投信連續賣超2日'); }
  if (candidate?.holders?.distributionTwoWeeks && (candidate?.holders?.latestHolderCountChange ?? 0) >= 0.05) {
    action = 'REDUCE_HALF'; reasons.push('大戶連降且股東人數週增至少5%');
  }
  if ((candidate?.credit?.margin5dChange ?? 0) >= 0.10 && candidate?.technical?.latestVolume120High
      && (finite(review?.branchConcentration20d) ?? 0) < 0 && review?.highLevelStagnation) {
    return { action: 'EXIT_ALL', reason: '融資暴增、120日爆量且分點轉負滯漲' };
  }
  const squeezeExhaustion = (candidate?.credit?.shortToMarginRatio ?? 0) >= 0.30
    && (candidate?.technical?.ma20Deviation ?? 0) > 0.20
    && candidate?.technical?.latestVolume120High
    && (review?.longUpperShadow || review?.blackCandle);
  if (squeezeExhaustion) return { action: 'EXIT_ALL', reason: '極端軋空末升段反轉' };
  if (position?.stage === 3 && close !== null && ma5 !== null && close < ma5) return { action: 'EXIT_ALL', reason: '主升段跌破MA5' };
  return { action, reason: reasons.join('；') };
}
